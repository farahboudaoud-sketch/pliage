package fr.pliage.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

/** Widget 3×2 : logo, « Reprendre » le dernier fichier et quatre raccourcis personnalisables. */
public class PliageWidget extends AppWidgetProvider {

    static final String PREFS = "pliage_widget";
    static final String ACTION_SHORTCUT = "fr.pliage.app.SHORTCUT";

    /** Raccourcis disponibles : identifiant, libellé, icône. */
    static final String[] KEYS = {"outils", "compresser", "convertir", "modifier", "fusionner", "signer", "essentiels", "fichiers"};
    static final String[] LABELS = {"Outils", "Compresser", "Convertir", "Modifier", "Fusionner", "Signer", "Essentiels", "Fichiers"};
    static final int[] ICONS = {R.drawable.ic_w_outils, R.drawable.ic_w_compresser, R.drawable.ic_w_convertir, R.drawable.ic_w_modifier,
            R.drawable.ic_w_fusionner, R.drawable.ic_w_signer, R.drawable.ic_w_essentiels, R.drawable.ic_w_fichiers};
    static final String[] DEFAULT_SLOTS = {"outils", "compresser", "convertir", "modifier"};
    static final String[] THEMES = {"auto", "clair", "sombre", "bordeaux"};
    static final String[] THEME_LABELS = {"Automatique (suit le téléphone)", "Clair", "Sombre", "Bordeaux"};

    private static final int[] CELLS = {R.id.w_c0, R.id.w_c1, R.id.w_c2, R.id.w_c3};
    private static final int[] CELL_ICONS = {R.id.w_i0, R.id.w_i1, R.id.w_i2, R.id.w_i3};
    private static final int[] CELL_TEXTS = {R.id.w_t0, R.id.w_t1, R.id.w_t2, R.id.w_t3};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context, manager, id);
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor ed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : ids) {
            ed.remove("theme_" + id).remove("resume_" + id);
            for (int i = 0; i < 4; i++) ed.remove("slot" + i + "_" + id);
        }
        ed.apply();
    }

    static void refreshAll(Context context) {
        AppWidgetManager m = AppWidgetManager.getInstance(context);
        int[] ids = m.getAppWidgetIds(new ComponentName(context, PliageWidget.class));
        if (ids != null) for (int id : ids) update(context, m, id);
    }

    static int indexOf(String key) {
        for (int i = 0; i < KEYS.length; i++) if (KEYS[i].equals(key)) return i;
        return 0;
    }

    static void update(Context ctx, AppWidgetManager manager, int id) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String theme = p.getString("theme_" + id, "auto");
        boolean resume = p.getBoolean("resume_" + id, true);
        String lastName = p.getString("lastName", "");
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.pliage_widget);

        // Couleurs du thème choisi ("auto" garde les ressources clair/sombre du système)
        if (!"auto".equals(theme)) {
            int bg, tile, iconBg, text, muted, icon, bird1;
            switch (theme) {
                case "sombre":
                    bg = R.drawable.widget_bg_dark; tile = R.drawable.widget_tile_dark; iconBg = R.drawable.widget_icon_bg_dark;
                    text = 0xFFF1E9EA; muted = 0xFF9A8A8C; icon = 0xFF211A1C; bird1 = 0xFFEDE6DA;
                    break;
                case "bordeaux":
                    bg = R.drawable.widget_bg_bordeaux; tile = R.drawable.widget_tile_bordeaux; iconBg = R.drawable.widget_icon_bg_bordeaux;
                    text = 0xFFFAF9F8; muted = 0xFFE2C9CD; icon = 0xFF7B1E2B; bird1 = 0xFFFAF9F8;
                    break;
                default:
                    bg = R.drawable.widget_bg_light; tile = R.drawable.widget_tile_light; iconBg = R.drawable.widget_icon_bg_light;
                    text = 0xFF2A1A1C; muted = 0xFF75605F; icon = 0xFFFFFFFF; bird1 = 0xFF7B1E2B;
            }
            v.setInt(R.id.w_root, "setBackgroundResource", bg);
            v.setInt(R.id.w_resume, "setBackgroundResource", tile);
            v.setTextColor(R.id.w_title, text);
            v.setTextColor(R.id.w_resume_label, muted);
            v.setTextColor(R.id.w_resume_name, text);
            v.setInt(R.id.w_logo, "setColorFilter", bird1);
            for (int i = 0; i < 4; i++) {
                v.setInt(CELL_ICONS[i], "setBackgroundResource", iconBg);
                v.setInt(CELL_ICONS[i], "setColorFilter", icon);
                v.setTextColor(CELL_TEXTS[i], text);
            }
        }

        // Ligne « Reprendre »
        if (resume && !lastName.isEmpty()) {
            v.setViewVisibility(R.id.w_resume, View.VISIBLE);
            v.setTextViewText(R.id.w_resume_name, lastName);
            String ext = lastName.contains(".") ? lastName.substring(lastName.lastIndexOf('.') + 1).toUpperCase() : "";
            v.setTextViewText(R.id.w_badge, ext.length() > 4 ? ext.substring(0, 4) : ext);
            v.setOnClickPendingIntent(R.id.w_resume, intent(ctx, id, 9, "resume"));
        } else if (resume) {
            v.setViewVisibility(R.id.w_resume, View.VISIBLE);
            v.setTextViewText(R.id.w_resume_name, "Ouvrir un fichier");
            v.setTextViewText(R.id.w_badge, "+");
            v.setOnClickPendingIntent(R.id.w_resume, intent(ctx, id, 9, "ouvrir"));
        } else {
            v.setViewVisibility(R.id.w_resume, View.GONE);
        }

        // Quatre raccourcis
        for (int i = 0; i < 4; i++) {
            String key = p.getString("slot" + i + "_" + id, DEFAULT_SLOTS[i]);
            int k = indexOf(key);
            v.setImageViewResource(CELL_ICONS[i], ICONS[k]);
            v.setTextViewText(CELL_TEXTS[i], LABELS[k]);
            v.setOnClickPendingIntent(CELLS[i], intent(ctx, id, i, KEYS[k]));
        }
        v.setOnClickPendingIntent(R.id.w_header, intent(ctx, id, 8, "outils"));
        manager.updateAppWidget(id, v);
    }

    private static PendingIntent intent(Context ctx, int widgetId, int slot, String what) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction(ACTION_SHORTCUT);
        i.putExtra("what", what);
        i.setData(Uri.parse("pliage://widget/" + widgetId + "/" + slot + "/" + what));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, widgetId * 16 + slot, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
