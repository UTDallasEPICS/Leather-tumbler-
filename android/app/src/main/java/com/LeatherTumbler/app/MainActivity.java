package com.LeatherTumbler.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable edge-to-edge: let content draw behind the system bars
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }

    @Override
    public void onStart() {
        super.onStart();

        // Inject viewport-fit=cover into the WebView so env(safe-area-inset-*) works
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.evaluateJavascript(
                "(function() {" +
                "  var meta = document.querySelector('meta[name=viewport]');" +
                "  if (meta) {" +
                "    var content = meta.getAttribute('content') || '';" +
                "    if (content.indexOf('viewport-fit=cover') === -1) {" +
                "      meta.setAttribute('content', content + ', viewport-fit=cover');" +
                "    }" +
                "  } else {" +
                "    meta = document.createElement('meta');" +
                "    meta.name = 'viewport';" +
                "    meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';" +
                "    document.head.appendChild(meta);" +
                "  }" +
                "})()",
                null
            );
        }
    }
}
