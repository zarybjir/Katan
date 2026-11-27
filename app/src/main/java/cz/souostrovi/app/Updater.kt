package cz.souostrovi.app

import android.app.Activity
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

// Stažení nové verze z vydání na GitHubu a předání systémovému instalátoru.
// Instalaci vždy potvrzuje uživatel; Android ji pustí jen pro APK podepsané stejným klíčem.
class Updater(private val act: Activity, private val cb: (String, String) -> Unit) {

    @Volatile private var busy = false

    // cb("progress", "0–100"), cb("ready", ""), cb("error", text)
    fun install(url: String) {
        if (busy) return
        if (!url.startsWith(ALLOWED)) { cb("error", "Neplatná adresa aktualizace."); return }
        busy = true
        thread(name = "update") {
            try {
                val dir = File(act.cacheDir, "updates").apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val file = File(dir, "souostrovi.apk")
                download(url, file)
                act.runOnUiThread { cb("ready", ""); launch(file) }
            } catch (e: Exception) {
                act.runOnUiThread { cb("error", "Stažení se nezdařilo. Zkontrolujte připojení k internetu.") }
            } finally {
                busy = false
            }
        }
    }

    private fun download(url: String, out: File) {
        var u = URL(url)
        var con: HttpURLConnection
        var hops = 0
        while (true) { // GitHub přesměrovává na jiný server; přesměrování se sleduje ručně
            con = (u.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15000; readTimeout = 30000
                setRequestProperty("Accept", "application/octet-stream")
            }
            val code = con.responseCode
            if (code in 300..399 && hops++ < 5) {
                val next = URL(u, con.getHeaderField("Location") ?: throw Exception("bez přesměrování"))
                if (next.protocol != "https") throw Exception("nešifrované přesměrování")
                con.disconnect(); u = next; continue
            }
            if (code != 200) throw Exception("HTTP $code")
            break
        }
        val total = con.contentLengthLong
        if (total > MAX_SIZE) throw Exception("příliš velký soubor")
        var done = 0L
        var last = -1
        con.inputStream.use { inp ->
            out.outputStream().use { o ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = inp.read(buf)
                    if (n < 0) break
                    done += n
                    if (done > MAX_SIZE) throw Exception("příliš velký soubor")
                    o.write(buf, 0, n)
                    if (total > 0) {
                        val pct = (done * 100 / total).toInt()
                        if (pct != last) { last = pct; act.runOnUiThread { cb("progress", "$pct") } }
                    }
                }
            }
        }
        con.disconnect()
    }

    // Systémový instalátor. Při prvním použití se Android zeptá na povolení instalace z této aplikace.
    private fun launch(file: File) {
        val uri = FileProvider.getUriForFile(act, act.packageName + ".updates", file)
        val i = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try { act.startActivity(i) } catch (e: Exception) { cb("error", "Instalaci nelze spustit.") }
    }

    companion object {
        // Aktualizace se smí stáhnout jen z vydání tohoto repozitáře.
        const val ALLOWED = "https://github.com/zarybjir/Katan/releases/download/"
        private const val MAX_SIZE = 100L * 1024 * 1024
    }
}
