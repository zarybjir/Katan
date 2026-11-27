package cz.souostrovi.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

// Služba v popředí: drží proces, procesor a Wi-Fi při zhasnuté obrazovce, dokud se hostuje.
// Server sám žije v Bridge; služba nemá žádnou logiku.
class HostService : Service() {

    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // startForeground se volá i při zastavení – systém ho po startForegroundService vyžaduje.
        try {
            if (Build.VERSION.SDK_INT >= 29)
                startForeground(NOTIF_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
            else
                startForeground(NOTIF_ID, notification())
        } catch (e: Exception) {
            Log.w(TAG, "startForeground selhalo", e)
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        } else {
            locks(true)
        }
        return START_NOT_STICKY
    }

    // Aplikace odstraněná z přehledu úloh: WebView s hrou zanikla, služba nemá co držet.
    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
    }

    override fun onDestroy() {
        locks(false)
        super.onDestroy()
    }

    @Suppress("DEPRECATION") // WIFI_MODE_FULL_HIGH_PERF: novější režim platí jen při rozsvícené obrazovce
    private fun locks(on: Boolean) {
        try {
            if (on) {
                if (wake == null) {
                    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                    wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "souostrovi:host").apply {
                        setReferenceCounted(false)
                        acquire(MAX_HOURS * 3600_000L)
                    }
                }
                if (wifi == null) {
                    val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                    wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "souostrovi:host").apply {
                        setReferenceCounted(false)
                        acquire()
                    }
                }
            } else {
                wake?.let { if (it.isHeld) it.release() }
                wifi?.let { if (it.isHeld) it.release() }
                wake = null
                wifi = null
            }
        } catch (e: Exception) {
            Log.w(TAG, "zámky", e)
        }
    }

    private fun notification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.host_channel), NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_hex)
            .setContentTitle(getString(R.string.host_title))
            .setContentText(getString(R.string.host_text))
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "HostService"
        private const val CHANNEL = "host"
        private const val NOTIF_ID = 1
        private const val MAX_HOURS = 12
        private const val ACTION_STOP = "cz.souostrovi.app.STOP"

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, HostService::class.java))
        }

        // Zastavení přes intent, aby služba stihla zavolat startForeground (jinak ji systém shodí).
        fun stop(ctx: Context) {
            val i = Intent(ctx, HostService::class.java)
            try {
                ctx.startService(Intent(i).setAction(ACTION_STOP))
            } catch (e: Exception) {
                ctx.stopService(i)
            }
        }
    }
}
