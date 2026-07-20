package com.resonance.stories;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The system WebView multiplies its default text zoom by the OS-level
        // font-scale accessibility setting, on top of the site's own responsive
        // typography — so on phones with enlarged fonts the app renders much
        // bigger than the same page in Chrome. Pin text zoom to 100% so the
        // WebView matches the browser rendering.
        WebSettings settings = this.bridge.getWebView().getSettings();
        settings.setTextZoom(100);
    }
}
