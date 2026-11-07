package fr.pliage.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcelable;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Fonctions natives de Pliage : fichiers (sélecteur, « Ouvrir avec », partage, enregistrement),
 * images, vidéos, archives ZIP, HTML → PDF, clés API chiffrées, conversion en ligne,
 * sauvegarde et widget.
 */
@CapacitorPlugin(name = "Pliage")
public class PliagePlugin extends Plugin {

    private static PliagePlugin instance;
    private SharedPreferences securePrefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private VideoCompressor video;

    private boolean launchedWithFile = false;

    @Override
    public void load() {
        instance = this;
        Intent intent = getActivity().getIntent();
        if (intent != null) {
            String a = intent.getAction();
            launchedWithFile = Intent.ACTION_VIEW.equals(a) || Intent.ACTION_SEND.equals(a) || Intent.ACTION_SEND_MULTIPLE.equals(a);
            handleIncoming(intent);
        }
    }

    /** L'appli a-t-elle été lancée pour ouvrir un fichier ? (pas d'animation dans ce cas) */
    @PluginMethod
    public void launchInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("file", launchedWithFile);
        call.resolve(ret);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIncoming(intent);
    }

    static PliagePlugin get() {
        return instance;
    }

    // ---------------------------------------------------------------- Fichiers reçus

    private void handleIncoming(Intent intent) {
        String action = intent.getAction();
        if (PliageWidget.ACTION_SHORTCUT.equals(action)) {
            String what = intent.getStringExtra("what");
            getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
            JSObject data = new JSObject();
            data.put("action", what == null ? "outils" : what);
            notifyListeners("shortcut", data, true);
            return;
        }
        final List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(action)) {
            if (intent.getData() != null) uris.add(intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            Parcelable p = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (p instanceof Uri) uris.add((Uri) p);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Parcelable> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) for (Parcelable p : list) if (p instanceof Uri) uris.add((Uri) p);
        }
        if (uris.isEmpty()) return;
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        final String mode = Intent.ACTION_VIEW.equals(action) ? "open" : "share";
        new Thread(() -> {
            JSObject data = new JSObject();
            JSArray files = new JSArray();
            for (Uri u : uris) {
                try {
                    files.put(copyIn(u));
                } catch (Exception e) {
                    JSObject err = new JSObject();
                    err.put("error", msg(e, "Fichier illisible"));
                    err.put("name", displayName(u));
                    files.put(err);
                }
            }
            data.put("files", files);
            data.put("mode", mode);
            notifyListeners("incoming", data, true);
        }).start();
    }

    // ---------------------------------------------------------------- Sélecteur de fichiers

    @PluginMethod
    public void pickFiles(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        JSArray mimes = call.getArray("mimes");
        if (mimes != null && mimes.length() > 0) {
            try {
                List<String> l = mimes.toList();
                intent.putExtra(Intent.EXTRA_MIME_TYPES, l.toArray(new String[0]));
            } catch (JSONException ignored) {
            }
        }
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        // « Parcourir » : le sélecteur s'ouvre directement dans le dossier Documents
        if ("documents".equals(call.getString("start", "")) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Documents"));
        }
        startActivityForResult(call, intent, "pickFilesResult");
    }

    @ActivityCallback
    private void pickFilesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            ret.put("files", new JSArray());
            call.resolve(ret);
            return;
        }
        Intent data = result.getData();
        final List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        new Thread(() -> {
            JSArray files = new JSArray();
            for (Uri u : uris) {
                try {
                    files.put(copyIn(u));
                } catch (Exception e) {
                    JSObject err = new JSObject();
                    err.put("error", msg(e, "Fichier illisible"));
                    err.put("name", displayName(u));
                    files.put(err);
                }
            }
            ret.put("files", files);
            call.resolve(ret);
        }).start();
    }

    /** Copie un fichier choisi dans le cache de l'appli et renvoie son chemin. */
    private JSObject copyIn(Uri uri) throws Exception {
        Context ctx = getContext();
        String name = safeName(displayName(uri));
        File dir = new File(ctx.getCacheDir(), "in/" + UUID.randomUUID().toString().substring(0, 8));
        if (!dir.mkdirs() && !dir.exists()) throw new Exception("Stockage indisponible");
        File dest = new File(dir, name);
        long size = 0;
        try (InputStream in = ctx.getContentResolver().openInputStream(uri);
             OutputStream out = new FileOutputStream(dest)) {
            if (in == null) throw new Exception("Fichier introuvable");
            byte[] buf = new byte[131072];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                size += n;
            }
        }
        String mime = ctx.getContentResolver().getType(uri);
        if (mime == null || mime.equals("application/octet-stream")) mime = mimeOf(name);
        JSObject ret = new JSObject();
        ret.put("path", dest.getAbsolutePath());
        ret.put("name", name);
        ret.put("size", size);
        ret.put("mime", mime);
        return ret;
    }

    private String displayName(Uri uri) {
        String name = null;
        try (Cursor c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name != null && name.contains("/")) name = name.substring(name.lastIndexOf('/') + 1);
        return name == null || name.isEmpty() ? "fichier" : name;
    }

    private static String safeName(String name) {
        String s = name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        if (s.isEmpty() || s.equals(".") || s.equals("..")) s = "fichier";
        if (s.length() > 150) s = s.substring(s.length() - 150);
        return s;
    }

    static String mimeOf(String name) {
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        switch (ext) {
            case "pdf": return "application/pdf";
            case "epub": return "application/epub+zip";
            case "mobi": return "application/x-mobipocket-ebook";
            case "azw3": return "application/vnd.amazon.ebook";
            case "fb2": return "application/x-fictionbook+xml";
            case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "doc": return "application/msword";
            case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "xls": return "application/vnd.ms-excel";
            case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "ppt": return "application/vnd.ms-powerpoint";
            case "zip": return "application/zip";
            case "txt": return "text/plain";
            case "html": case "htm": return "text/html";
            case "heic": case "heif": return "image/heic";
        }
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m == null ? "application/octet-stream" : m;
    }

    // ---------------------------------------------------------------- Lecture / écriture

    @PluginMethod
    public void paths(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("files", getContext().getFilesDir().getAbsolutePath());
        ret.put("cache", getContext().getCacheDir().getAbsolutePath());
        call.resolve(ret);
    }

    private File appFile(String path) throws Exception {
        if (path == null || path.isEmpty()) throw new Exception("Chemin manquant");
        File f = new File(path).getCanonicalFile();
        String files = getContext().getFilesDir().getCanonicalPath();
        String cache = getContext().getCacheDir().getCanonicalPath();
        String p = f.getPath();
        if (!(p.startsWith(files + File.separator) || p.startsWith(cache + File.separator)))
            throw new Exception("Chemin non autorisé");
        return f;
    }

    /** Écrit des données base64 dans un fichier (en plusieurs morceaux si besoin). */
    @PluginMethod
    public void writeChunk(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("data", "");
        boolean append = call.getBoolean("append", false);
        new Thread(() -> {
            try {
                File f = appFile(path);
                File parent = f.getParentFile();
                if (parent != null && !parent.exists()) //noinspection ResultOfMethodCallIgnored
                    parent.mkdirs();
                try (OutputStream out = new FileOutputStream(f, append)) {
                    out.write(Base64.decode(data, Base64.DEFAULT));
                }
                JSObject ret = new JSObject();
                ret.put("path", f.getAbsolutePath());
                ret.put("size", f.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Écriture impossible"));
            }
        }).start();
    }

    @PluginMethod
    public void copyFile(PluginCall call) {
        new Thread(() -> {
            try {
                File from = new File(call.getString("from", ""));
                File to = appFile(call.getString("to"));
                File parent = to.getParentFile();
                if (parent != null && !parent.exists()) //noinspection ResultOfMethodCallIgnored
                    parent.mkdirs();
                copy(from, to);
                JSObject ret = new JSObject();
                ret.put("path", to.getAbsolutePath());
                ret.put("size", to.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Copie impossible"));
            }
        }).start();
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        try {
            File f = appFile(call.getString("path"));
            deleteRec(f);
            call.resolve();
        } catch (Exception e) {
            call.reject(msg(e, "Suppression impossible"));
        }
    }

    @PluginMethod
    public void fileInfo(PluginCall call) {
        File f = new File(call.getString("path", ""));
        JSObject ret = new JSObject();
        ret.put("exists", f.exists());
        ret.put("size", f.length());
        call.resolve(ret);
    }

    @PluginMethod
    public void clearCache(PluginCall call) {
        deleteRec(new File(getContext().getCacheDir(), "in"));
        deleteRec(new File(getContext().getCacheDir(), "work"));
        call.resolve();
    }

    private static void copy(File from, File to) throws IOException {
        try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[131072];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    private static void deleteRec(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRec(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    // ---------------------------------------------------------------- Enregistrer, partager, ouvrir

    /** Copie le fichier dans Téléchargements/Pliage. */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String path = call.getString("path", "");
        String name = safeName(call.getString("name", new File(path).getName()));
        String mime = call.getString("mime", mimeOf(name));
        new Thread(() -> {
            try {
                File src = new File(path);
                String shown;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver cr = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Pliage");
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new Exception("Téléchargements indisponible");
                    try (InputStream in = new FileInputStream(src); OutputStream out = cr.openOutputStream(uri)) {
                        if (out == null) throw new Exception("Téléchargements indisponible");
                        byte[] buf = new byte[131072];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    }
                    v.clear();
                    v.put(MediaStore.Downloads.IS_PENDING, 0);
                    cr.update(uri, v, null, null);
                    String real = name;
                    try (Cursor c = cr.query(uri, new String[]{MediaStore.Downloads.DISPLAY_NAME}, null, null, null)) {
                        if (c != null && c.moveToFirst()) real = c.getString(0);
                    } catch (Exception ignored) {
                    }
                    shown = "Téléchargements/Pliage/" + real;
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Pliage");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    File dest = new File(dir, name);
                    int i = 1;
                    String base = name.contains(".") ? name.substring(0, name.lastIndexOf('.')) : name;
                    String ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : "";
                    while (dest.exists()) dest = new File(dir, base + " (" + (i++) + ")" + ext);
                    copy(src, dest);
                    shown = "Téléchargements/Pliage/" + dest.getName();
                }
                JSObject ret = new JSObject();
                ret.put("shown", shown);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Enregistrement impossible"));
            }
        }).start();
    }

    private String pendingSavePath;

    /** « Enregistrer sous… » : l'utilisateur choisit le dossier et le nom. */
    @PluginMethod
    public void saveAs(PluginCall call) {
        String path = call.getString("path", "");
        String name = safeName(call.getString("name", new File(path).getName()));
        pendingSavePath = path;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", mimeOf(name)));
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "saveAsResult");
    }

    @ActivityCallback
    private void saveAsResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject ret = new JSObject();
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        Uri uri = result.getData().getData();
        String src = pendingSavePath;
        new Thread(() -> {
            try (InputStream in = new FileInputStream(src); OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new Exception("Emplacement indisponible");
                byte[] buf = new byte[131072];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                JSObject ret = new JSObject();
                ret.put("saved", true);
                ret.put("name", displayName(uri));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Enregistrement impossible"));
            }
        }).start();
    }

    private Uri shareUri(File f) {
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
    }

    @PluginMethod
    public void share(PluginCall call) {
        try {
            JSArray paths = call.getArray("paths");
            ArrayList<Uri> uris = new ArrayList<>();
            String mime = null;
            for (Object o : paths.toList()) {
                File f = appFile(String.valueOf(o));
                uris.add(shareUri(f));
                String m = mimeOf(f.getName());
                mime = mime == null ? m : (mime.equals(m) ? m : "*/*");
            }
            if (uris.isEmpty()) throw new Exception("Aucun fichier");
            Intent send;
            if (uris.size() == 1) {
                send = new Intent(Intent.ACTION_SEND);
                send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                send.setClipData(ClipData.newRawUri("", uris.get(0)));
            } else {
                send = new Intent(Intent.ACTION_SEND_MULTIPLE);
                send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                ClipData cd = ClipData.newRawUri("", uris.get(0));
                for (int i = 1; i < uris.size(); i++) cd.addItem(new ClipData.Item(uris.get(i)));
                send.setClipData(cd);
            }
            send.setType(mime);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Partager");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(msg(e, "Partage impossible"));
        }
    }

    @PluginMethod
    public void openWith(PluginCall call) {
        try {
            File f = appFile(call.getString("path"));
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(shareUri(f), mimeOf(f.getName()));
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(view, "Ouvrir avec");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(msg(e, "Aucune appli ne peut ouvrir ce fichier"));
        }
    }

    // ---------------------------------------------------------------- Images

    /**
     * Réencode une image : format (jpeg, png, webp), qualité, redimensionnement,
     * données EXIF gardées ou non (avec ou sans position GPS). Lit aussi le HEIC.
     */
    @PluginMethod
    public void processImage(PluginCall call) {
        String path = call.getString("path", "");
        String out = call.getString("out");
        String format = call.getString("format", "jpeg");
        int quality = call.getInt("quality", 80);
        int maxSide = call.getInt("maxSide", 0);
        int scalePct = call.getInt("scalePct", 100);
        boolean keepExif = call.getBoolean("keepExif", false);
        boolean keepGps = call.getBoolean("keepGps", false);
        new Thread(() -> {
            try {
                File dest = appFile(out);
                File parent = dest.getParentFile();
                if (parent != null) //noinspection ResultOfMethodCallIgnored
                    parent.mkdirs();
                Bitmap bmp = decode(new File(path), maxSide, scalePct);
                Bitmap.CompressFormat cf;
                if ("png".equals(format)) cf = Bitmap.CompressFormat.PNG;
                else if ("webp".equals(format)) cf = Build.VERSION.SDK_INT >= 30 ? Bitmap.CompressFormat.WEBP_LOSSY : Bitmap.CompressFormat.WEBP;
                else cf = Bitmap.CompressFormat.JPEG;
                if (cf == Bitmap.CompressFormat.JPEG && bmp.hasAlpha()) {
                    Bitmap flat = Bitmap.createBitmap(bmp.getWidth(), bmp.getHeight(), Bitmap.Config.ARGB_8888);
                    flat.eraseColor(0xFFFFFFFF);
                    new android.graphics.Canvas(flat).drawBitmap(bmp, 0, 0, null);
                    bmp.recycle();
                    bmp = flat;
                }
                try (OutputStream os = new FileOutputStream(dest)) {
                    bmp.compress(cf, Math.max(1, Math.min(100, quality)), os);
                }
                int w = bmp.getWidth(), h = bmp.getHeight();
                bmp.recycle();
                if (keepExif && cf == Bitmap.CompressFormat.JPEG) copyExif(new File(path), dest, keepGps);
                JSObject ret = new JSObject();
                ret.put("path", dest.getAbsolutePath());
                ret.put("size", dest.length());
                ret.put("width", w);
                ret.put("height", h);
                call.resolve(ret);
            } catch (OutOfMemoryError e) {
                call.reject("Image trop grande pour la mémoire du téléphone");
            } catch (Exception e) {
                call.reject(msg(e, "Image illisible"));
            }
        }).start();
    }

    private Bitmap decode(File f, int maxSide, int scalePct) throws Exception {
        Bitmap bmp;
        if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.Source src = ImageDecoder.createSource(f);
            bmp = ImageDecoder.decodeBitmap(src, (decoder, info, s) -> {
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                int w = info.getSize().getWidth(), h = info.getSize().getHeight();
                double k = scalePct > 0 && scalePct < 100 ? scalePct / 100.0 : 1.0;
                if (maxSide > 0 && Math.max(w, h) * k > maxSide) k = maxSide / (double) Math.max(w, h);
                if (k < 1.0) decoder.setTargetSize(Math.max(1, (int) Math.round(w * k)), Math.max(1, (int) Math.round(h * k)));
            });
            return bmp; // ImageDecoder applique déjà l'orientation EXIF
        }
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(f.getAbsolutePath(), o);
        int w = o.outWidth, h = o.outHeight;
        if (w <= 0) throw new Exception("Format d'image non reconnu");
        double k = scalePct > 0 && scalePct < 100 ? scalePct / 100.0 : 1.0;
        if (maxSide > 0 && Math.max(w, h) * k > maxSide) k = maxSide / (double) Math.max(w, h);
        int sample = 1;
        while (k < 1.0 && (w / (sample * 2)) >= w * k) sample *= 2;
        o = new BitmapFactory.Options();
        o.inSampleSize = sample;
        bmp = BitmapFactory.decodeFile(f.getAbsolutePath(), o);
        if (bmp == null) throw new Exception("Format d'image non reconnu");
        int tw = (int) Math.round(w * k), th = (int) Math.round(h * k);
        if (k < 1.0 && (bmp.getWidth() != tw)) {
            Bitmap s = Bitmap.createScaledBitmap(bmp, Math.max(1, tw), Math.max(1, th), true);
            if (s != bmp) bmp.recycle();
            bmp = s;
        }
        int rot = 0;
        try {
            ExifInterface ex = new ExifInterface(f.getAbsolutePath());
            int or = ex.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (or == ExifInterface.ORIENTATION_ROTATE_90) rot = 90;
            else if (or == ExifInterface.ORIENTATION_ROTATE_180) rot = 180;
            else if (or == ExifInterface.ORIENTATION_ROTATE_270) rot = 270;
        } catch (Exception ignored) {
        }
        if (rot != 0) {
            Matrix m = new Matrix();
            m.postRotate(rot);
            Bitmap r = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            if (r != bmp) bmp.recycle();
            bmp = r;
        }
        return bmp;
    }

    private static final String[] EXIF_TAGS = {
            ExifInterface.TAG_DATETIME, ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_MAKE,
            ExifInterface.TAG_MODEL, ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_F_NUMBER,
            ExifInterface.TAG_ISO_SPEED_RATINGS, ExifInterface.TAG_FOCAL_LENGTH, ExifInterface.TAG_WHITE_BALANCE,
            ExifInterface.TAG_FLASH, ExifInterface.TAG_ARTIST, ExifInterface.TAG_COPYRIGHT
    };
    private static final String[] GPS_TAGS = {
            ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE,
            ExifInterface.TAG_GPS_LONGITUDE_REF, ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF,
            ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_DATESTAMP
    };

    private static void copyExif(File from, File to, boolean gps) {
        try {
            ExifInterface a = new ExifInterface(from.getAbsolutePath());
            ExifInterface b = new ExifInterface(to.getAbsolutePath());
            for (String t : EXIF_TAGS) {
                String v = a.getAttribute(t);
                if (v != null) b.setAttribute(t, v);
            }
            if (gps) for (String t : GPS_TAGS) {
                String v = a.getAttribute(t);
                if (v != null) b.setAttribute(t, v);
            }
            b.setAttribute(ExifInterface.TAG_ORIENTATION, String.valueOf(ExifInterface.ORIENTATION_NORMAL));
            b.saveAttributes();
        } catch (Exception ignored) {
        }
    }

    // ---------------------------------------------------------------- Vidéos

    @PluginMethod
    public void videoInfo(PluginCall call) {
        new Thread(() -> {
            MediaMetadataRetriever r = new MediaMetadataRetriever();
            try {
                r.setDataSource(call.getString("path", ""));
                JSObject ret = new JSObject();
                ret.put("width", parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)));
                ret.put("height", parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)));
                ret.put("rotation", parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)));
                ret.put("duration", parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)));
                ret.put("bitrate", parse(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Vidéo illisible"));
            } finally {
                try {
                    r.release();
                } catch (Exception ignored) {
                }
            }
        }).start();
    }

    private static long parse(String s) {
        try {
            return s == null ? 0 : Long.parseLong(s.trim());
        } catch (Exception e) {
            return 0;
        }
    }

    @PluginMethod
    public void compressVideo(PluginCall call) {
        final String path = call.getString("path", "");
        final String out;
        try {
            out = appFile(call.getString("out")).getAbsolutePath();
        } catch (Exception e) {
            call.reject(msg(e, "Chemin non autorisé"));
            return;
        }
        final int height = call.getInt("height", 0);
        final int bitrate = call.getInt("bitrate", 0);
        final boolean removeAudio = call.getBoolean("removeAudio", false);
        main.post(() -> {
            if (video != null) video.cancel();
            File parent = new File(out).getParentFile();
            if (parent != null) //noinspection ResultOfMethodCallIgnored
                parent.mkdirs();
            video = new VideoCompressor(getContext(), new VideoCompressor.Callback() {
                @Override
                public void onProgress(int percent) {
                    JSObject d = new JSObject();
                    d.put("progress", percent);
                    notifyListeners("videoProgress", d);
                }

                @Override
                public void onDone(long size) {
                    video = null;
                    JSObject ret = new JSObject();
                    ret.put("path", out);
                    ret.put("size", size);
                    call.resolve(ret);
                }

                @Override
                public void onError(String message) {
                    video = null;
                    call.reject(message);
                }
            });
            video.start(path, out, height, bitrate, removeAudio);
        });
    }

    @PluginMethod
    public void cancelVideo(PluginCall call) {
        main.post(() -> {
            if (video != null) video.cancel();
            video = null;
        });
        call.resolve();
    }

    // ---------------------------------------------------------------- Archives ZIP

    @PluginMethod
    public void zip(PluginCall call) {
        JSArray paths = call.getArray("paths");
        JSArray names = call.getArray("names");
        int level = call.getInt("level", 6);
        String out = call.getString("out");
        new Thread(() -> {
            try {
                File dest = appFile(out);
                File parent = dest.getParentFile();
                if (parent != null) //noinspection ResultOfMethodCallIgnored
                    parent.mkdirs();
                List<Object> ps = paths.toList();
                List<Object> ns = names == null ? null : names.toList();
                try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(dest))) {
                    zos.setLevel(Math.max(Deflater.NO_COMPRESSION, Math.min(Deflater.BEST_COMPRESSION, level)));
                    List<String> used = new ArrayList<>();
                    for (int i = 0; i < ps.size(); i++) {
                        File f = new File(String.valueOf(ps.get(i)));
                        String n = ns != null && i < ns.size() ? String.valueOf(ns.get(i)) : f.getName();
                        n = n.replace("\\", "/").replaceAll("^/+", "").replace("../", "");
                        String base = n;
                        int k = 1;
                        while (used.contains(n)) {
                            int dot = base.lastIndexOf('.');
                            n = dot > 0 ? base.substring(0, dot) + " (" + (k++) + ")" + base.substring(dot) : base + " (" + (k++) + ")";
                        }
                        used.add(n);
                        zos.putNextEntry(new ZipEntry(n));
                        try (InputStream in = new BufferedInputStream(new FileInputStream(f))) {
                            byte[] buf = new byte[131072];
                            int r;
                            while ((r = in.read(buf)) > 0) zos.write(buf, 0, r);
                        }
                        zos.closeEntry();
                        JSObject d = new JSObject();
                        d.put("progress", Math.round(100f * (i + 1) / ps.size()));
                        notifyListeners("zipProgress", d);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("path", dest.getAbsolutePath());
                ret.put("size", dest.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Archive impossible"));
            }
        }).start();
    }

    @PluginMethod
    public void unzip(PluginCall call) {
        String path = call.getString("path", "");
        String outDir = call.getString("outDir");
        new Thread(() -> {
            try {
                File dir = appFile(outDir);
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                String root = dir.getCanonicalPath() + File.separator;
                JSArray files = new JSArray();
                try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(path)))) {
                    ZipEntry e;
                    byte[] buf = new byte[131072];
                    while ((e = zis.getNextEntry()) != null) {
                        File f = new File(dir, e.getName()).getCanonicalFile();
                        if (!f.getPath().startsWith(root)) continue; // protection contre les chemins piégés
                        if (e.isDirectory()) {
                            //noinspection ResultOfMethodCallIgnored
                            f.mkdirs();
                            continue;
                        }
                        File p = f.getParentFile();
                        if (p != null) //noinspection ResultOfMethodCallIgnored
                            p.mkdirs();
                        try (OutputStream os = new FileOutputStream(f)) {
                            int r;
                            while ((r = zis.read(buf)) > 0) os.write(buf, 0, r);
                        }
                        JSObject o = new JSObject();
                        o.put("path", f.getAbsolutePath());
                        o.put("name", e.getName());
                        o.put("size", f.length());
                        files.put(o);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("files", files);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Archive illisible"));
            }
        }).start();
    }

    // ---------------------------------------------------------------- HTML → PDF

    @PluginMethod
    public void htmlToPdf(PluginCall call) {
        final String html = call.getString("html", "");
        final String size = call.getString("pageSize", "A4");
        final boolean landscape = call.getBoolean("landscape", false);
        final File dest;
        try {
            dest = appFile(call.getString("out"));
        } catch (Exception e) {
            call.reject(msg(e, "Chemin non autorisé"));
            return;
        }
        main.post(() -> HtmlToPdf.render(getContext(), html, size, landscape, dest, new HtmlToPdf.Callback() {
            @Override
            public void onDone() {
                JSObject ret = new JSObject();
                ret.put("path", dest.getAbsolutePath());
                ret.put("size", dest.length());
                call.resolve(ret);
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        }));
    }

    // ---------------------------------------------------------------- Clés API chiffrées

    private SharedPreferences secure() throws Exception {
        if (securePrefs == null) {
            String alias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);
            securePrefs = EncryptedSharedPreferences.create("pliage_secure", alias, getContext(),
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        }
        return securePrefs;
    }

    String secret(String key) {
        try {
            return secure().getString(key, "");
        } catch (Exception e) {
            return "";
        }
    }

    @PluginMethod
    public void setSecret(PluginCall call) {
        try {
            String v = call.getString("value", "").trim();
            SharedPreferences.Editor ed = secure().edit();
            if (v.isEmpty()) ed.remove(call.getString("key", ""));
            else ed.putString(call.getString("key", ""), v);
            ed.apply();
            call.resolve();
        } catch (Exception e) {
            call.reject(msg(e, "Stockage sécurisé indisponible"));
        }
    }

    @PluginMethod
    public void hasSecret(PluginCall call) {
        String v = secret(call.getString("key", ""));
        JSObject ret = new JSObject();
        ret.put("has", !v.isEmpty());
        ret.put("tail", v.length() > 4 ? v.substring(v.length() - 4) : "");
        call.resolve(ret);
    }

    // ---------------------------------------------------------------- Conversion en ligne

    @PluginMethod
    public void onlineConvert(PluginCall call) {
        String service = call.getString("service", "convertapi");
        String path = call.getString("path", "");
        String from = call.getString("from", "");
        String to = call.getString("to", "");
        String out = call.getString("out");
        new Thread(() -> {
            try {
                String key = secret(service);
                if (key.isEmpty()) throw new Exception("Ajoute ta clé API dans Réglages");
                File dest = appFile(out);
                File parent = dest.getParentFile();
                if (parent != null) //noinspection ResultOfMethodCallIgnored
                    parent.mkdirs();
                OnlineConverter.Progress p = (label) -> {
                    JSObject d = new JSObject();
                    d.put("label", label);
                    notifyListeners("onlineProgress", d);
                };
                if ("cloudconvert".equals(service)) OnlineConverter.cloudConvert(key, new File(path), from, to, dest, p);
                else OnlineConverter.convertApi(key, new File(path), from, to, dest, p);
                JSObject ret = new JSObject();
                ret.put("path", dest.getAbsolutePath());
                ret.put("size", dest.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Conversion en ligne impossible"));
            }
        }).start();
    }

    @PluginMethod
    public void testOnline(PluginCall call) {
        String service = call.getString("service", "convertapi");
        new Thread(() -> {
            try {
                String key = secret(service);
                if (key.isEmpty()) throw new Exception("Aucune clé enregistrée");
                String info = "cloudconvert".equals(service) ? OnlineConverter.testCloudConvert(key) : OnlineConverter.testConvertApi(key);
                JSObject ret = new JSObject();
                ret.put("info", info);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Connexion impossible"));
            }
        }).start();
    }

    // ---------------------------------------------------------------- Sauvegarde

    /** Crée un ZIP avec data.json et le dossier personnel (files/essentiels). */
    @PluginMethod
    public void backup(PluginCall call) {
        String json = call.getString("json", "{}");
        String out = call.getString("out");
        new Thread(() -> {
            try {
                File dest = appFile(out);
                File parent = dest.getParentFile();
                if (parent != null) //noinspection ResultOfMethodCallIgnored
                    parent.mkdirs();
                File ess = new File(getContext().getFilesDir(), "essentiels");
                try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(dest))) {
                    zos.putNextEntry(new ZipEntry("data.json"));
                    zos.write(json.getBytes("UTF-8"));
                    zos.closeEntry();
                    File[] kids = ess.listFiles();
                    byte[] buf = new byte[131072];
                    if (kids != null) for (File f : kids) {
                        if (!f.isFile()) continue;
                        zos.putNextEntry(new ZipEntry("essentiels/" + f.getName()));
                        try (InputStream in = new FileInputStream(f)) {
                            int r;
                            while ((r = in.read(buf)) > 0) zos.write(buf, 0, r);
                        }
                        zos.closeEntry();
                    }
                }
                JSObject ret = new JSObject();
                ret.put("path", dest.getAbsolutePath());
                ret.put("size", dest.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Sauvegarde impossible"));
            }
        }).start();
    }

    @PluginMethod
    public void restore(PluginCall call) {
        String path = call.getString("path", "");
        new Thread(() -> {
            try {
                File ess = new File(getContext().getFilesDir(), "essentiels");
                //noinspection ResultOfMethodCallIgnored
                ess.mkdirs();
                String root = ess.getCanonicalPath() + File.separator;
                String json = null;
                try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(path)))) {
                    ZipEntry e;
                    byte[] buf = new byte[131072];
                    while ((e = zis.getNextEntry()) != null) {
                        if (e.getName().equals("data.json")) {
                            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                            int r;
                            while ((r = zis.read(buf)) > 0) bo.write(buf, 0, r);
                            json = bo.toString("UTF-8");
                        } else if (e.getName().startsWith("essentiels/") && !e.isDirectory()) {
                            File f = new File(ess, e.getName().substring(11)).getCanonicalFile();
                            if (!f.getPath().startsWith(root)) continue;
                            try (OutputStream os = new FileOutputStream(f)) {
                                int r;
                                while ((r = zis.read(buf)) > 0) os.write(buf, 0, r);
                            }
                        }
                    }
                }
                if (json == null) throw new Exception("Ce fichier n'est pas une sauvegarde Pliage");
                JSObject ret = new JSObject();
                ret.put("json", json);
                ret.put("dir", ess.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(msg(e, "Restauration impossible"));
            }
        }).start();
    }

    // ---------------------------------------------------------------- Widget

    @PluginMethod
    public void updateWidget(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(PliageWidget.PREFS, Context.MODE_PRIVATE);
        p.edit().putString("lastName", call.getString("name", "")).putString("lastPath", call.getString("path", "")).apply();
        PliageWidget.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void widgetInstalled(PluginCall call) {
        AppWidgetManager m = AppWidgetManager.getInstance(getContext());
        int[] ids = m.getAppWidgetIds(new ComponentName(getContext(), PliageWidget.class));
        JSObject ret = new JSObject();
        ret.put("count", ids == null ? 0 : ids.length);
        call.resolve(ret);
    }

    // ----------------------------------------------------------------

    static String msg(Throwable e, String fallback) {
        String m = e.getMessage();
        if (e instanceof java.net.UnknownHostException) return "Pas de connexion internet";
        return m == null || m.isEmpty() ? fallback : m;
    }

    @SuppressWarnings("unused")
    private static JSONArray emptyArray() {
        return new JSONArray();
    }
}
