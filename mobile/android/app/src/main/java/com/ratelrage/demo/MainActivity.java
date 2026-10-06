package com.ratelrage.demo;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /* THE HOST BRIDGE: what the web build can ask the phone to do.
     *
     * Deliberately one method. The game is a self-contained offline package
     * with no INTERNET permission and no remote content of any kind, so the
     * usual addJavascriptInterface risk -- a hostile page reaching a native
     * method -- has nowhere to come from: everything in this WebView is
     * shipped inside the APK. Keep it that way, and keep this surface this
     * small; the moment anything remote can load here, this has to be
     * reconsidered.
     *
     * `canQuit` exists so the menus can tell a real host from a browser tab
     * and label (or hide) the option accordingly, rather than offering a Quit
     * that silently does nothing on desktop. */
    public class Host {
        @JavascriptInterface
        public boolean canQuit() {
            return true;
        }

        /* finishAndRemoveTask, not finish(): the player asked to LEAVE, and
         * finish() alone leaves the task in the recents list looking like a
         * still-running game. Posted to the UI thread because a
         * @JavascriptInterface method arrives on the WebView's own thread. */
        @JavascriptInterface
        public void quit() {
            runOnUiThread(() -> finishAndRemoveTask());
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Expose the WebView to chrome://inspect on a desktop Chrome so the
        // on-device console is readable. This APK is the internal debug demo;
        // gate this behind BuildConfig.DEBUG before any release build.
        WebView.setWebContentsDebuggingEnabled(true);
        super.onCreate(savedInstanceState);
        /* Serve packaged media with honest byte ranges. Capacitor's own local
         * server answers a Range request from byte 0 while claiming it starts
         * at the requested offset, which corrupts every seek -- the intro
         * looping, the voice-overs dropping out. See RangeAwareWebViewClient.
         * Must follow super.onCreate(): the bridge does not exist before it. */
        if (bridge != null) bridge.setWebViewClient(new RangeAwareWebViewClient(bridge));
        /* window.RatelHost -- the menus' QUIT path. See Host above. */
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().addJavascriptInterface(new Host(), "RatelHost");
        }
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Android re-shows the bars after some interactions; re-arm on focus.
        if (hasFocus) hideSystemBars();
    }

    /* Immersive sticky fullscreen: no status/nav bars, and a swipe reveals
     * them transiently. The game itself keeps its authored 16:9 letterbox;
     * this only removes the SYSTEM chrome around it. */
    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
