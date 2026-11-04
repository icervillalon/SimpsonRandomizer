package com.simpsonrandomizer.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import androidx.webkit.WebViewAssetLoader

/**
 * Muestra la interfaz web incluida en assets/web (la misma de la app Flask,
 * pero sin servidor). Los enlaces externos, como los de Disney+, se abren
 * fuera: si la app de Disney+ está instalada, se abre directamente en ella.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(YELLOW, YELLOW),
            navigationBarStyle = SystemBarStyle.light(SKY_BOTTOM, SKY_BOTTOM),
        )
        super.onCreate(savedInstanceState)

        // Sirve assets/ como https://appassets.androidplatform.net/assets/ (más seguro que file://).
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // recuerda los filtros de la ruleta
            settings.allowFileAccess = false
            setBackgroundColor(SKY)
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == APP_HOST) return false
                    openExternally(request.url)
                    return true
                }
            }
        }

        // Pantalla de borde a borde: la barra de estado queda amarilla como la cabecera
        // y la de navegación, del azul claro del cielo.
        val statusBarBackground = View(this).apply { setBackgroundColor(YELLOW) }
        val root = FrameLayout(this).apply {
            setBackgroundColor(SKY_BOTTOM)
            addView(webView)
            addView(statusBarBackground, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP))
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            statusBarBackground.updateLayoutParams { height = bars.top }
            webView.updateLayoutParams<FrameLayout.LayoutParams> {
                setMargins(bars.left, bars.top, bars.right, bars.bottom)
            }
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        // Atrás recorre las pantallas de la app (ficha → catálogo → ruleta) antes de salir.
        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private companion object {
        const val APP_HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$APP_HOST/assets/web/index.html"
        val YELLOW = Color.parseColor("#FFD90F")
        val SKY = Color.parseColor("#5DB8F2")
        val SKY_BOTTOM = Color.parseColor("#A6DEFC")
    }
}
