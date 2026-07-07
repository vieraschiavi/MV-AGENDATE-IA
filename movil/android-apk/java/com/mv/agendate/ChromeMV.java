package com.mv.agendate;

// WebChromeClient con soporte de geolocalización (clase con nombre, no anónima).
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;

public class ChromeMV extends WebChromeClient {

    private final MainActivity actividad;

    public ChromeMV(MainActivity actividad) {
        this.actividad = actividad;
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        actividad.pedirPermisoGeo(origin, callback);
    }
}
