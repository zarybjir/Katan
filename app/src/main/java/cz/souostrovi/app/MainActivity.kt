package cz.souostrovi.app

import android.app.Activity
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var bridge: Bridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Hra se načítá ze stálého https originu, aby localStorage přežilo restart aplikace.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
        webView = WebView(this)
        webView.setBackgroundColor(getColor(R.color.bg))
        setContentView(webView)

        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        // ws:// v místní síti ze stránky s https originem.
        s.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.textZoom = 100
        s.setSupportZoom(false)

        // Dlouhý stisk patří hře, ne výběru textu.
        webView.isLongClickable = false
        webView.isHapticFeedbackEnabled = false
        webView.setOnLongClickListener { true }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            // Mimo vlastní origin se nenaviguje a nic se neotevírá v prohlížeči.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != HOST
        }

        bridge = Bridge(this, webView)
        webView.addJavascriptInterface(bridge, "Android")
        webView.loadUrl(START_URL)
    }

    // ---------- celá obrazovka ----------
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) immersive()
    }

    // Skryje stavový a navigační řádek; tažením od okraje se dočasně ukážou.
    private fun immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    // ---------- tlačítko zpět ----------
    // Hra rozhodne sama: když window.onAndroidBack() vrátí true, zpracovala ho; jinak se aplikace ukončí.
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        webView.evaluateJavascript(
            "(function(){try{return !!(window.onAndroidBack&&window.onAndroidBack())}catch(e){return false}})()"
        ) { if (it != "true") finish() }
    }

    // WebView se při odchodu na pozadí záměrně nepozastavuje (žádné onPause/pauseTimers):
    // hostitel i klient musí zpracovávat zprávy i se zhasnutou obrazovkou.

    override fun onDestroy() {
        // Se zánikem WebView končí i hra hostitele – server, služba a spojení se zavřou vždy.
        bridge.shutdown()
        webView.removeJavascriptInterface("Android")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$HOST/assets/hra/index.html"
    }
}
