package com.mv.agendate;

// MV Agendate IA — app Android nativa mínima (sin dependencias externas).
// WebView que carga la app MV empaquetada en assets y habla con el servidor
// configurado (engranaje dentro de la app). Sin clases anónimas: d8 de
// build-tools 34 falla con las clases anónimas que emite javac moderno.
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private WebView web;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage (URL del servidor, sesión)
        s.setGeolocationEnabled(true);         // "usar mi ubicación" del tasador
        s.setAllowFileAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new ChromeMV(this));

        web.loadUrl("file:///android_asset/www/index.html");
    }

    // Llamado por ChromeMV cuando la web pide geolocalización
    void pedirPermisoGeo(String origin, GeolocationPermissions.Callback callback) {
        if (Build.VERSION.SDK_INT >= 23 &&
                checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            geoCallback = callback;
            geoOrigin = origin;
            requestPermissions(new String[]{ android.Manifest.permission.ACCESS_FINE_LOCATION }, 1);
        } else {
            callback.invoke(origin, true, false);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == 1 && geoCallback != null) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            geoCallback.invoke(geoOrigin, ok, false);
            geoCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
