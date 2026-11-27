package cz.souostrovi.app

import org.java_websocket.WebSocket
import org.java_websocket.drafts.Draft_6455
import org.java_websocket.extensions.IExtension
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.protocols.IProtocol
import org.java_websocket.protocols.Protocol
import org.java_websocket.server.WebSocketServer
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

// WebSocket server hostitele. Jen přeposílá text mezi spojeními a WebView, nezná pravidla.
class LanServer private constructor(
    port: Int,
    private val ids: AtomicInteger,
    private val cb: Events
) : WebSocketServer(InetSocketAddress(port), 1, listOf(draft())) {

    interface Events {
        fun onOpen(id: Int)
        fun onMessage(id: Int, text: String)
        fun onClose(id: Int)
    }

    private val conns = ConcurrentHashMap<Int, WebSocket>()
    private val ready = CountDownLatch(1)
    @Volatile private var started = false
    @Volatile private var quiet = false

    // ---------- události knihovny (vlákna serveru) ----------
    override fun onStart() {
        started = true
        ready.countDown()
    }

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake?) {
        if (quiet || conns.size >= MAX_CONNS) {
            conn.close(1013, "plno")
            return
        }
        val id = ids.incrementAndGet()
        conn.setAttachment(id)
        conns[id] = conn
        cb.onOpen(id)
    }

    override fun onMessage(conn: WebSocket, message: String) {
        val id = conn.getAttachment<Int?>() ?: return
        if (conns.containsKey(id)) cb.onMessage(id, message)
    }

    // Binární zprávy hra nepoužívá.
    override fun onMessage(conn: WebSocket, message: ByteBuffer) {}

    override fun onClose(conn: WebSocket, code: Int, reason: String?, remote: Boolean) {
        val id = conn.getAttachment<Int?>() ?: return
        if (conns.remove(id) != null && !quiet) cb.onClose(id)
    }

    // conn == null znamená chybu serveru samotného (typicky obsazený port).
    override fun onError(conn: WebSocket?, ex: Exception?) {
        if (conn == null) ready.countDown()
    }

    // ---------- ovládání (z vlákna mostu) ----------
    fun send(id: Int, text: String) {
        val c = conns[id] ?: return
        try { if (c.isOpen) c.send(text) } catch (e: Exception) { }
    }

    // Zavře spojení; onClose se ohlásí právě jednou.
    fun close(id: Int) {
        val c = conns.remove(id) ?: return
        cb.onClose(id)
        try { c.close() } catch (e: Exception) { }
    }

    // Ukončí server bez dalších zpětných volání. Blokuje nejvýš chvíli – nevolat z hlavního vlákna.
    fun shutdown() {
        quiet = true
        conns.clear()
        try { stop(500) } catch (e: Exception) { }
    }

    private fun startAndWait(): Boolean {
        isReuseAddr = true
        isTcpNoDelay = true
        connectionLostTimeout = LOST_TIMEOUT_S
        start()
        ready.await(3, TimeUnit.SECONDS)
        if (!started) shutdown()
        return started
    }

    companion object {
        const val PORT = 47600
        const val PORT_TRIES = 20
        const val MAX_MSG = 64 * 1024
        const val MAX_CONNS = 16
        const val LOST_TIMEOUT_S = 20

        // Návrh protokolu s omezenou velikostí zprávy; delší zpráva spojení ukončí (kód 1009).
        fun draft() = Draft_6455(emptyList<IExtension>(), listOf<IProtocol>(Protocol("")), MAX_MSG)

        // Zkusí PORT a při obsazení další porty; vrátí běžící server, nebo null.
        fun open(ids: AtomicInteger, cb: Events): LanServer? {
            for (p in PORT..PORT + PORT_TRIES) {
                val s = LanServer(p, ids, cb)
                if (s.startAndWait()) return s
            }
            return null
        }
    }
}
