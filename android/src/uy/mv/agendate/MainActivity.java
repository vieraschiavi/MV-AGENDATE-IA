package uy.mv.agendate;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

/**
 * MV Agendate IA — contenedor nativo Android.
 * Muestra el workspace web (nube por defecto, o el servidor de la PC del
 * profesional) con integración nativa: descargas a "Descargas" (Excel/PDF),
 * subida de archivos (logo), WhatsApp/teléfono en sus apps, botón atrás,
 * página de error con reintento y elección de servidor.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "mv";
    private static final String PREF_SERVIDOR = "servidor";
    private static final String SERVIDOR_NUBE = "https://mv-agendate-ia.vercel.app";
    private static final int REQ_ARCHIVO = 71;
    private static final int REQ_PERMISO_DESCARGA = 72;

    private WebView web;
    private ProgressBar barra;
    private ValueCallback<Uri[]> archivoPendiente;
    // Descarga que espera el permiso de almacenamiento (solo Android 9 o menor).
    private String dUrl, dUserAgent, dContentDisposition, dMimeType;

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private String servidorBase() {
        String s = prefs().getString(PREF_SERVIDOR, SERVIDOR_NUBE).trim();
        if (s.isEmpty()) s = SERVIDOR_NUBE;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private String urlInicio() { return servidorBase() + "/app/"; }

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);

        FrameLayout raiz = new FrameLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        raiz.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        barra = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams lpBarra = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(4));
        barra.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.parseColor("#1f7ae0")));
        raiz.addView(barra, lpBarra);
        setContentView(raiz);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);       // localStorage (sesión de la cuenta, idioma)
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        // El servidor local de la PC no tiene certificado: permitir su contenido http.
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true); // checkout de MercadoPago dentro de la app

        web.addJavascriptInterface(new MVNativo(), "MVNativo");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView vista, WebResourceRequest req) {
                Uri uri = req.getUrl();
                String esquema = uri.getScheme() == null ? "" : uri.getScheme();
                String host = uri.getHost() == null ? "" : uri.getHost();
                // WhatsApp siempre en su app; tel/mailto/intent en la app que corresponda.
                boolean esWhatsapp = host.equals("wa.me") || host.endsWith("whatsapp.com");
                boolean esWeb = esquema.equals("http") || esquema.equals("https");
                if (esWeb && !esWhatsapp) return false; // navega dentro (incluye MercadoPago)
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, R.string.sin_app, Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView vista, WebResourceRequest req, WebResourceError error) {
                if (req.isForMainFrame()) mostrarPaginaError();
            }

            @Override
            public boolean onRenderProcessGone(WebView vista, RenderProcessGoneDetail detalle) {
                // Si Android mata el proceso del WebView, la app se rearma sola
                // en vez de cerrarse con error.
                recreate();
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView vista, int p) {
                barra.setProgress(p);
                barra.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(WebView vista, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (archivoPendiente != null) archivoPendiente.onReceiveValue(null);
                archivoPendiente = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_ARCHIVO);
                } catch (ActivityNotFoundException e) {
                    archivoPendiente = null;
                    Toast.makeText(MainActivity.this, R.string.sin_app, Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        // Exportaciones (Excel/CSV/PDF) → carpeta Descargas del teléfono.
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        != PackageManager.PERMISSION_GRANTED) {
                    dUrl = url; dUserAgent = userAgent; dContentDisposition = contentDisposition; dMimeType = mimeType;
                    requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERMISO_DESCARGA);
                    return;
                }
                descargar(url, userAgent, contentDisposition, mimeType);
            }
        });

        // Si no hay estado guardado (o no se pudo restaurar), arrancamos de cero.
        if (estado == null || web.restoreState(estado) == null) web.loadUrl(urlInicio());
        atenderIntent(getIntent());
    }

    private void descargar(String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            DownloadManager.Request pedido = new DownloadManager.Request(Uri.parse(url));
            String nombre = URLUtil.guessFileName(url, contentDisposition, mimeType);
            pedido.setTitle(nombre);
            pedido.setMimeType(mimeType);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) pedido.addRequestHeader("Cookie", cookie);
            if (userAgent != null) pedido.addRequestHeader("User-Agent", userAgent);
            pedido.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            pedido.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nombre);
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(pedido);
            Toast.makeText(this, R.string.descargando, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] permisos, int[] resultados) {
        super.onRequestPermissionsResult(req, permisos, resultados);
        if (req == REQ_PERMISO_DESCARGA) {
            if (resultados.length > 0 && resultados[0] == PackageManager.PERMISSION_GRANTED && dUrl != null) {
                descargar(dUrl, dUserAgent, dContentDisposition, dMimeType);
            } else {
                Toast.makeText(this, R.string.permiso_descarga, Toast.LENGTH_LONG).show();
            }
            dUrl = null; dUserAgent = null; dContentDisposition = null; dMimeType = null;
        }
    }

    @Override
    protected void onActivityResult(int req, int resultado, Intent datos) {
        super.onActivityResult(req, resultado, datos);
        if (req == REQ_ARCHIVO && archivoPendiente != null) {
            archivoPendiente.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultado, datos));
            archivoPendiente = null;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        atenderIntent(intent);
    }

    private void atenderIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("abrir_config", false)) {
            intent.removeExtra("abrir_config");
            dialogoServidor();
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    // ---------- Página de error (sin conexión / servidor caído) ----------

    private void mostrarPaginaError() {
        String html = "<!doctype html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                + "<style>body{font-family:sans-serif;background:#0f2a43;color:#fff;display:flex;"
                + "align-items:center;justify-content:center;min-height:96vh;margin:0;text-align:center}"
                + ".c{padding:28px;max-width:340px}h1{font-size:1.25rem;margin:0 0 10px}"
                + "p{color:#c9d7e2;font-size:.95rem;line-height:1.5}"
                + "button{display:block;width:100%;margin-top:12px;padding:14px;border:0;border-radius:12px;"
                + "font-size:1rem;font-weight:700;background:#1f7ae0;color:#fff}"
                + "button.sec{background:transparent;border:2px solid rgba(255,255,255,.4)}</style></head>"
                + "<body><div class='c'><div style='font-size:2.6rem'>📡</div>"
                + "<h1>" + getString(R.string.error_titulo) + "</h1>"
                + "<p>" + getString(R.string.error_detalle) + "</p>"
                + "<button onclick='MVNativo.reintentar()'>" + getString(R.string.reintentar) + "</button>"
                + "<button class='sec' onclick='MVNativo.configurar()'>" + getString(R.string.cambiar_servidor) + "</button>"
                + "</div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private class MVNativo {
        @JavascriptInterface
        public void reintentar() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { web.loadUrl(urlInicio()); }
            });
        }

        @JavascriptInterface
        public void configurar() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { dialogoServidor(); }
            });
        }
    }

    // ---------- Elección de servidor (nube o PC local) ----------

    private void dialogoServidor() {
        LinearLayout caja = new LinearLayout(this);
        caja.setOrientation(LinearLayout.VERTICAL);
        int m = dp(20);
        caja.setPadding(m, dp(8), m, 0);
        EditText campo = new EditText(this);
        campo.setText(servidorBase());
        campo.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_URI);
        campo.setSingleLine(true);
        caja.addView(campo, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        final EditText campoFinal = campo;
        new AlertDialog.Builder(this)
                .setTitle(R.string.dialogo_servidor_titulo)
                .setMessage(R.string.dialogo_servidor_detalle)
                .setView(caja)
                .setPositiveButton(R.string.guardar, new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface d, int w) {
                        String url = campoFinal.getText().toString().trim();
                        if (!url.isEmpty() && !url.startsWith("http://") && !url.startsWith("https://")) {
                            url = "http://" + url; // una IP pelada de la LAN
                        }
                        prefs().edit().putString(PREF_SERVIDOR, url.isEmpty() ? SERVIDOR_NUBE : url).apply();
                        web.loadUrl(urlInicio());
                    }
                })
                .setNeutralButton(R.string.restaurar_nube, new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface d, int w) {
                        prefs().edit().putString(PREF_SERVIDOR, SERVIDOR_NUBE).apply();
                        web.loadUrl(urlInicio());
                    }
                })
                .setNegativeButton(R.string.cancelar, null)
                .show();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
