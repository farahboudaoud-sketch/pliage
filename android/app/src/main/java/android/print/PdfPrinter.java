package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * Écrit le contenu d'un PrintDocumentAdapter (ici celui d'une WebView) dans un fichier PDF,
 * sans passer par la boîte de dialogue d'impression. Placé dans le paquet android.print
 * pour accéder aux constructeurs des callbacks.
 */
public class PdfPrinter {

    public interface Callback {
        void onDone();

        void onError(String message);
    }

    public static void print(final PrintDocumentAdapter adapter, PrintAttributes attrs, final File out, final Callback cb) {
        adapter.onStart();
        adapter.onLayout(null, attrs, new CancellationSignal(), new PrintDocumentAdapter.LayoutResultCallback() {
            @Override
            public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                try {
                    final ParcelFileDescriptor pfd = ParcelFileDescriptor.open(out,
                            ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE | ParcelFileDescriptor.MODE_READ_WRITE);
                    adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES}, pfd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
                        @Override
                        public void onWriteFinished(PageRange[] pages) {
                            try {
                                pfd.close();
                            } catch (Exception ignored) {
                            }
                            adapter.onFinish();
                            cb.onDone();
                        }

                        @Override
                        public void onWriteFailed(CharSequence error) {
                            try {
                                pfd.close();
                            } catch (Exception ignored) {
                            }
                            adapter.onFinish();
                            cb.onError(error == null ? "Création du PDF impossible" : error.toString());
                        }
                    });
                } catch (Exception e) {
                    cb.onError(e.getMessage() == null ? "Création du PDF impossible" : e.getMessage());
                }
            }

            @Override
            public void onLayoutFailed(CharSequence error) {
                cb.onError(error == null ? "Mise en page impossible" : error.toString());
            }
        }, null);
    }
}
