package com.ratelrage.demo;

import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * CORRECT BYTE-RANGE SERVING FOR PACKAGED MEDIA.
 *
 * Capacitor 6's WebViewLocalServer.handleLocalRequest() answers a Range request
 * with HTTP 206 and a Content-Range header naming the requested offset, but it
 * hands back a stream opened at BYTE ZERO -- it never skips to that offset (see
 * node_modules/@capacitor/android/.../WebViewLocalServer.java:346-373; its
 * LollipopLazyInputStream just reopens the asset).
 *
 * Android's media stack uses Range requests for progressive playback and for
 * EVERY seek, so a seek to t>0 handed the decoder the top of the file labelled
 * as the middle. Observed on device: the intro cinematic restarting in short
 * loops (each drift resync re-served byte 0), voice-overs cutting out mid-line
 * or never starting, and the studio splash glitching.
 *
 * This client intercepts ranged requests for media files only and serves them
 * properly: skip to the start offset, bound the stream to the requested slice,
 * and report a truthful Content-Range/Content-Length. Everything else -- every
 * non-media request, and every media request without a Range header -- falls
 * straight through to Capacitor's own handling, which is correct for those.
 */
public class RangeAwareWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "RatelRange";

    /** Capacitor packages the web root at assets/public (Bridge.DEFAULT_WEB_ASSET_DIR). */
    private static final String ASSET_ROOT = "public";

    private final Bridge bridge;

    public RangeAwareWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse ranged = tryRange(request);
        if (ranged != null) return ranged;
        return super.shouldInterceptRequest(view, request);
    }

    private WebResourceResponse tryRange(WebResourceRequest request) {
        if (request == null) return null;

        Map<String, String> headers = request.getRequestHeaders();
        if (headers == null) return null;
        String rangeHeader = headers.get("Range");
        if (rangeHeader == null) rangeHeader = headers.get("range");
        if (rangeHeader == null) return null;               // not a ranged request

        Uri url = request.getUrl();
        if (url == null) return null;
        // Only our own origin; anything else is not ours to serve.
        if (bridge.getServerUrl() != null) return null;
        String host = url.getHost();
        if (host == null || !host.equalsIgnoreCase(bridge.getHost())) return null;

        String path = url.getPath();
        if (path == null) return null;
        String mime = mimeFor(path);
        if (mime == null) return null;                      // not a media file -- leave it alone

        String assetPath = ASSET_ROOT + (path.startsWith("/") ? path : "/" + path);

        try {
            AssetFileDescriptor afd = bridge.getContext().getAssets().openFd(assetPath);
            long total = afd.getLength();
            if (total <= 0 || total == AssetFileDescriptor.UNKNOWN_LENGTH) {
                afd.close();
                return null;                                // can't size it -- let Capacitor try
            }

            long[] span = parseRange(rangeHeader, total);
            if (span == null) {
                afd.close();
                return null;                                // malformed -- fall through
            }
            long start = span[0];
            long end = span[1];
            long length = end - start + 1;

            InputStream stream = afd.createInputStream();
            skipFully(stream, start);

            Map<String, String> responseHeaders = new HashMap<>();
            responseHeaders.put("Accept-Ranges", "bytes");
            responseHeaders.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
            responseHeaders.put("Content-Length", Long.toString(length));
            responseHeaders.put("Cache-Control", "no-cache");

            return new WebResourceResponse(
                mime, null, 206, "Partial Content",
                responseHeaders, new BoundedInputStream(stream, length)
            );
        } catch (IOException e) {
            // openFd fails for a compressed asset, and open() would give us no
            // reliable length -- Capacitor's path is no worse, so defer to it.
            Log.w(TAG, "range passthrough for " + assetPath + ": " + e.getMessage());
            return null;
        }
    }

    /** "bytes=start-end", "bytes=start-" and "bytes=-suffix". Null if unusable. */
    private static long[] parseRange(String header, long total) {
        String spec = header.trim().toLowerCase(Locale.US);
        if (!spec.startsWith("bytes=")) return null;
        spec = spec.substring(6).trim();
        if (spec.contains(",")) return null;                // multi-range: not worth serving
        int dash = spec.indexOf('-');
        if (dash < 0) return null;

        String fromText = spec.substring(0, dash).trim();
        String toText = spec.substring(dash + 1).trim();
        long start;
        long end;
        try {
            if (fromText.isEmpty()) {
                if (toText.isEmpty()) return null;
                long suffix = Long.parseLong(toText);       // last N bytes
                if (suffix <= 0) return null;
                start = Math.max(0, total - suffix);
                end = total - 1;
            } else {
                start = Long.parseLong(fromText);
                end = toText.isEmpty() ? total - 1 : Long.parseLong(toText);
            }
        } catch (NumberFormatException e) {
            return null;
        }
        if (start < 0 || start >= total) return null;       // unsatisfiable
        if (end >= total) end = total - 1;
        if (end < start) return null;
        return new long[] { start, end };
    }

    /** InputStream.skip() may return short; a partial skip is the original bug. */
    private static void skipFully(InputStream stream, long count) throws IOException {
        long left = count;
        while (left > 0) {
            long moved = stream.skip(left);
            if (moved > 0) { left -= moved; continue; }
            if (stream.read() < 0) throw new IOException("asset ended " + left + " bytes early");
            left--;
        }
    }

    private static String mimeFor(String path) {
        String lower = path.toLowerCase(Locale.US);
        if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        return null;
    }

    /** Stops at the end of the requested slice, so the body matches Content-Length. */
    private static class BoundedInputStream extends FilterInputStream {

        private long remaining;

        BoundedInputStream(InputStream in, long limit) {
            super(in);
            this.remaining = limit;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = super.read();
            if (b >= 0) remaining--;
            return b;
        }

        @Override
        public int read(byte[] buffer, int offset, int count) throws IOException {
            if (remaining <= 0) return -1;
            int want = (int) Math.min(count, remaining);
            int got = super.read(buffer, offset, want);
            if (got > 0) remaining -= got;
            return got;
        }

        @Override
        public long skip(long count) throws IOException {
            long moved = super.skip(Math.min(count, remaining));
            remaining -= moved;
            return moved;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), remaining);
        }
    }
}
