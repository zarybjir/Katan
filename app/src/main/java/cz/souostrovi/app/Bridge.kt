package cz.souostrovi.app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import org.json.JSONArray
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

// Most mezi hrou (window.Android) a sítí. Metody volá WebView z vlastního vlákna (ne hlavního);
// zpětná volání do JS jdou vždy přes hlavní vlákno, stav NSD se mění jen na hlavním vlákně.
class Bridge(private val act: Activity, private val web: WebView) {

    private val main = Handler(Looper.getMainLooper())
    private val ids = AtomicInteger(0) // společná řada id pro spojení serveru i klientská
    @Volatile private var dead = false

    // ---------- zpětná volání do JS ----------
    private fun js(fn: String, args: String) {
        main.post {
            if (!dead) web.evaluateJavascript("window.AndroidCb&&AndroidCb.$fn&&AndroidCb.$fn($args)", null)
        }
    }

    // ---------- server ----------
    private val hostLock = Any()
    private var server: LanServer? = null

    private val serverEvents = object : LanServer.Events {
        override fun onOpen(id: Int) = js("onOpen", "$id")
        override fun onMessage(id: Int, text: String) = js("onMessage", "$id,${JSONObject.quote(text)}")
        override fun onClose(id: Int) = js("onClose", "$id")
    }

    @JavascriptInterface
    fun startServer(name: String): String {
        synchronized(hostLock) {
            try {
                stopHost()
                val s = LanServer.open(ids, serverEvents)
                    ?: return err("Server se nepodařilo spustit, porty ${LanServer.PORT}–${LanServer.PORT + LanServer.PORT_TRIES} jsou obsazené.")
                server = s
                askNotifications()
                HostService.start(act)
                main.post { nsdRegister(name, s.port) }
                return JSONObject().put("port", s.port).put("ips", JSONArray(ips())).toString()
            } catch (e: Exception) {
                Log.w(TAG, "startServer", e)
                stopHost()
                return err("Server se nepodařilo spustit: ${e.message ?: e.javaClass.simpleName}")
            }
        }
    }

    @JavascriptInterface
    fun stopServer() {
        synchronized(hostLock) { stopHost() }
    }

    @JavascriptInterface
    fun send(id: Int, text: String) {
        server?.send(id, text)
    }

    @JavascriptInterface
    fun closeClient(id: Int) {
        server?.close(id)
    }

    // Zavře server, ohlášení i službu. Blokuje krátce – jen mimo hlavní vlákno.
    private fun stopHost() {
        val s = server ?: return
        server = null
        main.post { nsdUnregister() }
        s.shutdown()
        try { HostService.stop(act) } catch (e: Exception) { Log.w(TAG, "stop služby", e) }
    }

    private fun err(text: String) = JSONObject().put("error", text).toString()

    // Oznámení služby je od Androidu 13 vidět jen se svolením; služba běží i bez něj.
    private fun askNotifications() {
        if (Build.VERSION.SDK_INT < 33) return
        if (act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        act.runOnUiThread {
            try { act.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1) } catch (e: Exception) { }
        }
    }

    // ---------- klientská spojení ----------
    private val clients = ConcurrentHashMap<Int, WebSocketClient>()

    // Vrátí id hned; výsledek přijde jako onWsOpen, nebo onWsClose (i při neplatné adrese).
    @JavascriptInterface
    fun wsConnect(url: String): Int {
        val id = ids.incrementAndGet()
        try {
            val c = object : WebSocketClient(URI(url.trim()), LanServer.draft(), null, CONNECT_TIMEOUT_MS) {
                override fun onOpen(handshake: ServerHandshake?) {
                    if (clients.containsKey(id)) js("onWsOpen", "$id")
                }

                override fun onMessage(message: String) {
                    if (clients.containsKey(id)) js("onWsMessage", "$id,${JSONObject.quote(message)}")
                }

                override fun onClose(code: Int, reason: String?, remote: Boolean) = wsGone(id)

                override fun onError(ex: Exception?) {}
            }
            c.connectionLostTimeout = LanServer.LOST_TIMEOUT_S
            c.isTcpNoDelay = true
            clients[id] = c
            c.connect()
        } catch (e: Exception) {
            clients[id]?.let { clients.remove(id) }
            js("onWsClose", "$id")
        }
        return id
    }

    @JavascriptInterface
    fun wsSend(id: Int, text: String) {
        val c = clients[id] ?: return
        try { if (c.isOpen) c.send(text) } catch (e: Exception) { }
    }

    @JavascriptInterface
    fun wsClose(id: Int) {
        val c = clients[id] ?: return
        wsGone(id)
        try { c.close() } catch (e: Exception) { }
    }

    // onWsClose právě jednou pro každé id.
    private fun wsGone(id: Int) {
        if (clients.remove(id) != null) js("onWsClose", "$id")
    }

    // ---------- NSD: ohlášení hry (jen hlavní vlákno) ----------
    private val nsd: NsdManager get() = act.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var regListener: NsdManager.RegistrationListener? = null
    private var ownName: String? = null // jméno, pod kterým systém hru ohlásil

    private fun nsdRegister(name: String, port: Int) {
        nsdUnregister()
        val info = NsdServiceInfo().apply {
            serviceName = cutName(name)
            serviceType = NSD_TYPE
            setPort(port)
        }
        val l = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(i: NsdServiceInfo) {
                main.post {
                    if (regListener !== this) return@post
                    ownName = i.serviceName
                    if (found.remove(i.serviceName) != null) emitFound()
                }
            }

            override fun onRegistrationFailed(i: NsdServiceInfo, code: Int) {
                Log.w(TAG, "NSD ohlášení selhalo: $code")
            }

            override fun onServiceUnregistered(i: NsdServiceInfo) {}
            override fun onUnregistrationFailed(i: NsdServiceInfo, code: Int) {}
        }
        regListener = l
        try {
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, l)
        } catch (e: Exception) {
            Log.w(TAG, "NSD ohlášení", e)
            regListener = null
        }
    }

    private fun nsdUnregister() {
        val l = regListener ?: return
        regListener = null
        ownName = null
        try { nsd.unregisterService(l) } catch (e: Exception) { }
    }

    // Jméno služby smí mít nejvýš 63 bajtů v UTF-8.
    private fun cutName(name: String): String {
        var n = name.trim().ifEmpty { "Souostroví" }
        while (n.toByteArray().size > 63) n = n.dropLast(1)
        return n
    }

    // ---------- NSD: hledání her (jen hlavní vlákno) ----------
    private var discListener: NsdManager.DiscoveryListener? = null
    private var gen = 0 // roste při každém zapnutí i vypnutí; staré odpovědi se zahodí
    private val found = LinkedHashMap<String, Pair<String, Int>>() // jméno → adresa, port
    private val queue = ArrayDeque<NsdServiceInfo>() // starší Androidy řeší jen jednu službu naráz
    private val tries = HashMap<String, Int>()
    private var resolving = false
    private var mcast: WifiManager.MulticastLock? = null

    @JavascriptInterface
    fun discover(on: Boolean) {
        main.post { if (on) discStart() else discStop() }
    }

    private fun discStart() {
        if (dead) return
        if (discListener != null) {
            emitFound()
            return
        }
        val g = ++gen
        try {
            val wm = act.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            mcast = wm.createMulticastLock("souostrovi").apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (e: Exception) {
            Log.w(TAG, "multicast lock", e)
        }
        val l = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(type: String) {}
            override fun onDiscoveryStopped(type: String) {}

            override fun onStartDiscoveryFailed(type: String, code: Int) {
                Log.w(TAG, "NSD hledání selhalo: $code")
                main.post { if (gen == g) discStop() }
            }

            override fun onStopDiscoveryFailed(type: String, code: Int) {}

            override fun onServiceFound(i: NsdServiceInfo) {
                main.post {
                    if (gen != g) return@post
                    queue.addLast(i)
                    pump()
                }
            }

            override fun onServiceLost(i: NsdServiceInfo) {
                main.post {
                    if (gen != g) return@post
                    queue.removeAll { it.serviceName == i.serviceName }
                    if (found.remove(i.serviceName) != null) emitFound()
                }
            }
        }
        discListener = l
        emitFound()
        try {
            nsd.discoverServices(NSD_TYPE, NsdManager.PROTOCOL_DNS_SD, l)
        } catch (e: Exception) {
            Log.w(TAG, "NSD hledání", e)
            discListener = null
            discStop()
        }
    }

    private fun discStop() {
        gen++
        discListener?.let { try { nsd.stopServiceDiscovery(it) } catch (e: Exception) { } }
        discListener = null
        queue.clear()
        tries.clear()
        found.clear()
        resolving = false
        try { mcast?.let { if (it.isHeld) it.release() } } catch (e: Exception) { }
        mcast = null
    }

    // Vyřeší další službu z fronty (adresa a port).
    private fun pump() {
        if (resolving) return
        val i = queue.removeFirstOrNull() ?: return
        val g = gen
        var done = false
        resolving = true
        // Každý výsledek (i vypršení času) uvolní frontu právě jednou.
        fun finish(r: NsdServiceInfo?, retry: Boolean) {
            main.post {
                if (done || gen != g) return@post
                done = true
                resolving = false
                if (r != null) addFound(r)
                else if (retry && (tries[i.serviceName] ?: 0) < 2) {
                    tries[i.serviceName] = (tries[i.serviceName] ?: 0) + 1
                    queue.addLast(i)
                }
                pump()
            }
        }
        try {
            @Suppress("DEPRECATION") // náhrada (registerServiceInfoCallback) je až od API 34
            nsd.resolveService(i, object : NsdManager.ResolveListener {
                override fun onResolveFailed(s: NsdServiceInfo, code: Int) = finish(null, true)
                override fun onServiceResolved(s: NsdServiceInfo) = finish(s, false)
            })
        } catch (e: Exception) {
            finish(null, false)
        }
        main.postDelayed({ finish(null, true) }, RESOLVE_TIMEOUT_MS)
    }

    private fun addFound(r: NsdServiceInfo) {
        val name = r.serviceName ?: return
        if (name == ownName) return
        @Suppress("DEPRECATION")
        val a = (if (Build.VERSION.SDK_INT >= 34) r.hostAddresses.firstOrNull { it is Inet4Address } else null) ?: r.host
        val ip = (a as? Inet4Address)?.hostAddress ?: return
        found[name] = ip to r.port
        emitFound()
    }

    // Vždy celý aktuální seznam.
    private fun emitFound() {
        val arr = JSONArray()
        for ((name, hp) in found) arr.put(JSONObject().put("name", name).put("host", hp.first).put("port", hp.second))
        js("onFound", JSONObject.quote(arr.toString()))
    }

    // ---------- ostatní ----------
    @JavascriptInterface
    fun localIps(): String = JSONArray(ips()).toString()

    // IPv4 adresy bez loopbacku; Wi-Fi a hotspot první, mobilní data poslední.
    private fun ips(): List<String> {
        val out = ArrayList<Pair<Int, String>>()
        try {
            for (ni in NetworkInterface.getNetworkInterfaces() ?: return emptyList()) {
                if (!ni.isUp || ni.isLoopback) continue
                val n = ni.name.lowercase()
                val rank = when {
                    n.startsWith("wlan") || n.startsWith("swlan") || n.startsWith("ap") || n.startsWith("softap") -> 0
                    n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("pdp") || n.startsWith("tun") -> 2
                    else -> 1
                }
                for (a in ni.inetAddresses) {
                    if (a is Inet4Address && !a.isLoopbackAddress) a.hostAddress?.let { out.add(rank to it) }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "ips", e)
        }
        return out.sortedBy { it.first }.map { it.second }
    }

    @JavascriptInterface
    fun keepAwake(on: Boolean) {
        act.runOnUiThread {
            if (on) act.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else act.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // ---------- aktualizace ----------
    private val updater = Updater(act) { kind, data -> js("onUpdate", "${JSONObject.quote(kind)},${JSONObject.quote(data)}") }

    @JavascriptInterface
    fun versionCode(): Int = try {
        @Suppress("DEPRECATION")
        act.packageManager.getPackageInfo(act.packageName, 0).versionCode
    } catch (e: Exception) {
        0
    }

    // Stáhne APK z vydání na GitHubu a otevře instalátor; průběh jde do AndroidCb.onUpdate(druh, data).
    @JavascriptInterface
    fun updateInstall(url: String) = updater.install(url)

    @JavascriptInterface
    fun version(): String = try {
        act.packageManager.getPackageInfo(act.packageName, 0).versionName ?: ""
    } catch (e: Exception) {
        ""
    }

    // ---------- konec aktivity (hlavní vlákno) ----------
    fun shutdown() {
        dead = true
        discStop()
        // Zavírání soketů nesmí běžet na hlavním vlákně.
        thread(name = "bridge-shutdown") {
            synchronized(hostLock) { stopHost() }
            for (id in clients.keys.toList()) clients.remove(id)?.let { try { it.close() } catch (e: Exception) { } }
        }
    }

    companion object {
        private const val TAG = "Bridge"
        private const val NSD_TYPE = "_souostrovi._tcp"
        private const val CONNECT_TIMEOUT_MS = 5000
        private const val RESOLVE_TIMEOUT_MS = 6000L
    }
}
