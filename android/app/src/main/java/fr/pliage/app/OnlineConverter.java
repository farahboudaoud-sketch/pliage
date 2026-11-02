package fr.pliage.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Conversion « haute fidélité » via ConvertAPI ou CloudConvert (clé API de l'utilisateur). */
class OnlineConverter {

    interface Progress {
        void step(String label);
    }

    // ---------------------------------------------------------------- ConvertAPI

    static void convertApi(String key, File in, String from, String to, File dest, Progress p) throws Exception {
        p.step("Envoi du fichier…");
        String url = "https://v2.convertapi.com/convert/" + enc(from) + "/to/" + enc(to) + "?StoreFile=true";
        HttpURLConnection c = open(url, "POST", key);
        String boundary = "----Pliage" + UUID.randomUUID();
        c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        c.setDoOutput(true);
        c.setChunkedStreamingMode(65536);
        try (DataOutputStream out = new DataOutputStream(c.getOutputStream())) {
            writeFilePart(out, boundary, "File", in);
            out.writeBytes("--" + boundary + "--\r\n");
        }
        p.step("Conversion en cours…");
        JSONObject res = readJson(c);
        JSONArray files = res.optJSONArray("Files");
        if (files == null || files.length() == 0) throw new Exception("Le service n'a renvoyé aucun fichier");
        p.step("Téléchargement du résultat…");
        if (files.length() == 1) {
            download(files.getJSONObject(0).getString("Url"), dest, null);
        } else {
            try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(dest))) {
                for (int i = 0; i < files.length(); i++) {
                    JSONObject f = files.getJSONObject(i);
                    zos.putNextEntry(new ZipEntry(f.optString("FileName", "fichier-" + (i + 1))));
                    download(f.getString("Url"), null, zos);
                    zos.closeEntry();
                }
            }
        }
    }

    static String testConvertApi(String key) throws Exception {
        HttpURLConnection c = open("https://v2.convertapi.com/user", "GET", key);
        JSONObject u = readJson(c);
        if (u.has("ConversionsTotal") && u.has("ConversionsConsumed")) {
            long left = u.optLong("ConversionsTotal") - u.optLong("ConversionsConsumed");
            return "Connexion réussie · " + left + " conversions restantes";
        }
        if (u.has("SecondsLeft")) return "Connexion réussie · " + u.optLong("SecondsLeft") + " secondes restantes";
        return "Connexion réussie";
    }

    // ---------------------------------------------------------------- CloudConvert

    static void cloudConvert(String key, File in, String from, String to, File dest, Progress p) throws Exception {
        p.step("Préparation…");
        JSONObject tasks = new JSONObject();
        tasks.put("envoi", new JSONObject().put("operation", "import/upload"));
        tasks.put("conversion", new JSONObject().put("operation", "convert").put("input", "envoi")
                .put("input_format", from).put("output_format", to));
        tasks.put("export", new JSONObject().put("operation", "export/url").put("input", "conversion"));
        JSONObject body = new JSONObject().put("tasks", tasks).put("tag", "pliage");
        HttpURLConnection c = open("https://api.cloudconvert.com/v2/jobs", "POST", key);
        c.setRequestProperty("Content-Type", "application/json");
        c.setDoOutput(true);
        try (OutputStream os = c.getOutputStream()) {
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        JSONObject job = readJson(c).getJSONObject("data");
        String jobId = job.getString("id");
        JSONObject upload = null;
        JSONArray ts = job.getJSONArray("tasks");
        for (int i = 0; i < ts.length(); i++) if ("envoi".equals(ts.getJSONObject(i).optString("name"))) upload = ts.getJSONObject(i);
        if (upload == null || upload.optJSONObject("result") == null) throw new Exception("Réponse inattendue du service");
        JSONObject form = upload.getJSONObject("result").getJSONObject("form");

        p.step("Envoi du fichier…");
        HttpURLConnection up = (HttpURLConnection) new URL(form.getString("url")).openConnection();
        up.setRequestMethod("POST");
        up.setConnectTimeout(30000);
        up.setReadTimeout(300000);
        String boundary = "----Pliage" + UUID.randomUUID();
        up.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        up.setDoOutput(true);
        up.setChunkedStreamingMode(65536);
        try (DataOutputStream out = new DataOutputStream(up.getOutputStream())) {
            JSONObject params = form.optJSONObject("parameters");
            if (params != null) {
                Iterator<String> it = params.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    out.writeBytes("--" + boundary + "\r\n");
                    out.writeBytes("Content-Disposition: form-data; name=\"" + k + "\"\r\n\r\n");
                    out.write(params.getString(k).getBytes(StandardCharsets.UTF_8));
                    out.writeBytes("\r\n");
                }
            }
            writeFilePart(out, boundary, "file", in);
            out.writeBytes("--" + boundary + "--\r\n");
        }
        int code = up.getResponseCode();
        if (code >= 400) throw new Exception("Envoi refusé par le service (" + code + ")");
        up.disconnect();

        p.step("Conversion en cours…");
        long deadline = System.currentTimeMillis() + 15 * 60 * 1000;
        while (true) {
            if (System.currentTimeMillis() > deadline) throw new Exception("La conversion prend trop de temps");
            Thread.sleep(2000);
            JSONObject j = readJson(open("https://api.cloudconvert.com/v2/jobs/" + jobId, "GET", key)).getJSONObject("data");
            String status = j.optString("status");
            if ("error".equals(status)) {
                JSONArray tt = j.getJSONArray("tasks");
                for (int i = 0; i < tt.length(); i++) {
                    JSONObject t = tt.getJSONObject(i);
                    if ("error".equals(t.optString("status"))) throw new Exception(t.optString("message", "Conversion refusée par le service"));
                }
                throw new Exception("Conversion refusée par le service");
            }
            if ("finished".equals(status)) {
                JSONArray tt = j.getJSONArray("tasks");
                for (int i = 0; i < tt.length(); i++) {
                    JSONObject t = tt.getJSONObject(i);
                    if (!"export".equals(t.optString("name"))) continue;
                    JSONArray files = t.getJSONObject("result").getJSONArray("files");
                    p.step("Téléchargement du résultat…");
                    if (files.length() == 1) {
                        download(files.getJSONObject(0).getString("url"), dest, null);
                    } else {
                        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(dest))) {
                            for (int k = 0; k < files.length(); k++) {
                                JSONObject f = files.getJSONObject(k);
                                zos.putNextEntry(new ZipEntry(f.optString("filename", "fichier-" + (k + 1))));
                                download(f.getString("url"), null, zos);
                                zos.closeEntry();
                            }
                        }
                    }
                    return;
                }
                throw new Exception("Le service n'a renvoyé aucun fichier");
            }
        }
    }

    static String testCloudConvert(String key) throws Exception {
        JSONObject u = readJson(open("https://api.cloudconvert.com/v2/users/me", "GET", key)).optJSONObject("data");
        if (u != null && u.has("credits")) return "Connexion réussie · " + u.optLong("credits") + " crédits restants";
        return "Connexion réussie";
    }

    // ---------------------------------------------------------------- Outils HTTP

    private static String enc(String s) throws Exception {
        return URLEncoder.encode(s.toLowerCase(), "UTF-8");
    }

    private static HttpURLConnection open(String url, String method, String key) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(30000);
        c.setReadTimeout(600000);
        c.setRequestProperty("Authorization", "Bearer " + key);
        c.setRequestProperty("Accept", "application/json");
        return c;
    }

    private static void writeFilePart(DataOutputStream out, String boundary, String field, File f) throws Exception {
        out.writeBytes("--" + boundary + "\r\n");
        String name = f.getName().replace("\"", "");
        out.write(("Content-Disposition: form-data; name=\"" + field + "\"; filename=\"" + name + "\"\r\n").getBytes(StandardCharsets.UTF_8));
        out.writeBytes("Content-Type: application/octet-stream\r\n\r\n");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        out.writeBytes("\r\n");
    }

    private static JSONObject readJson(HttpURLConnection c) throws Exception {
        int code = c.getResponseCode();
        InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
        String text = "";
        if (is != null) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            is.close();
            text = bo.toString("UTF-8");
        }
        c.disconnect();
        if (code == 401 || code == 403) throw new Exception("Clé API refusée : vérifie-la dans Réglages");
        if (code == 402) throw new Exception("Quota gratuit épuisé sur ce service");
        if (code == 429) throw new Exception("Trop de demandes, réessaie dans un moment");
        if (code >= 400) {
            String m = "";
            try {
                JSONObject e = new JSONObject(text);
                m = e.optString("Message", e.optString("message", ""));
            } catch (Exception ignored) {
            }
            throw new Exception(m.isEmpty() ? "Le service a refusé la conversion (" + code + ")" : m);
        }
        return new JSONObject(text);
    }

    private static void download(String url, File dest, OutputStream into) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(30000);
        c.setReadTimeout(600000);
        int code = c.getResponseCode();
        if (code >= 400) throw new Exception("Téléchargement du résultat impossible (" + code + ")");
        try (InputStream in = c.getInputStream()) {
            OutputStream out = into != null ? into : new FileOutputStream(dest);
            try {
                byte[] buf = new byte[131072];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } finally {
                if (into == null) out.close();
            }
        }
        c.disconnect();
    }
}
