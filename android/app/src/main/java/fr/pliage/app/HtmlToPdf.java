package fr.pliage.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.print.PdfPrinter;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;

/** Transforme du HTML en PDF hors ligne grâce au moteur d'impression de la WebView. */
class HtmlToPdf {

    interface Callback {
        void onDone();

        void onError(String message);
    }

    // Garde une référence pour que la WebView ne soit pas libérée pendant le rendu
    @SuppressLint("StaticFieldLeak")
    private static WebView current;

    @SuppressLint("SetJavaScriptEnabled")
    static void render(Context ctx, String html, String pageSize, boolean landscape, File out, Callback cb) {
        try {
            File parent = out.getParentFile();
            if (parent != null) //noinspection ResultOfMethodCallIgnored
                parent.mkdirs();
            final WebView wv = new WebView(ctx);
            current = wv;
            wv.getSettings().setJavaScriptEnabled(false);
            wv.getSettings().setAllowFileAccess(false);
            wv.setWebViewClient(new WebViewClient() {
                boolean done = false;

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (done) return;
                    done = true;
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        try {
                            PrintDocumentAdapter adapter = wv.createPrintDocumentAdapter("Pliage");
                            PrintAttributes.MediaSize size = "LETTER".equalsIgnoreCase(pageSize)
                                    ? PrintAttributes.MediaSize.NA_LETTER : PrintAttributes.MediaSize.ISO_A4;
                            if (landscape) size = size.asLandscape();
                            PrintAttributes attrs = new PrintAttributes.Builder()
                                    .setMediaSize(size)
                                    .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 600, 600))
                                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                    .build();
                            PdfPrinter.print(adapter, attrs, out, new PdfPrinter.Callback() {
                                @Override
                                public void onDone() {
                                    current = null;
                                    wv.destroy();
                                    cb.onDone();
                                }

                                @Override
                                public void onError(String message) {
                                    current = null;
                                    wv.destroy();
                                    cb.onError(message);
                                }
                            });
                        } catch (Exception e) {
                            current = null;
                            cb.onError(PliagePlugin.msg(e, "Création du PDF impossible"));
                        }
                    }, 400);
                }
            });
            wv.loadDataWithBaseURL("https://pliage.local/", html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            cb.onError(PliagePlugin.msg(e, "Création du PDF impossible"));
        }
    }
}
