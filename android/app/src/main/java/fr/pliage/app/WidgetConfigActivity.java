package fr.pliage.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

/** Personnalisation du widget : thème, ligne « Reprendre » et choix des quatre raccourcis. */
public class WidgetConfigActivity extends Activity {

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent().getExtras();
        if (extras != null) widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        final SharedPreferences p = getSharedPreferences(PliageWidget.PREFS, Context.MODE_PRIVATE);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(0xFFFAF9F8);
        scroll.setFitsSystemWindows(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(24), dp(20), dp(24));
        scroll.addView(col);

        TextView title = new TextView(this);
        title.setText("Widget Pliage");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFF2A1A1C);
        col.addView(title);

        col.addView(label("Thème"));
        final RadioGroup themes = new RadioGroup(this);
        String curTheme = p.getString("theme_" + widgetId, "auto");
        for (int i = 0; i < PliageWidget.THEMES.length; i++) {
            RadioButton rb = new RadioButton(this);
            rb.setId(1000 + i);
            rb.setText(PliageWidget.THEME_LABELS[i]);
            rb.setTextColor(0xFF2A1A1C);
            rb.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            rb.setMinHeight(dp(48));
            themes.addView(rb);
            if (PliageWidget.THEMES[i].equals(curTheme)) rb.setChecked(true);
        }
        col.addView(themes);

        col.addView(label("Contenu"));
        final CheckBox resume = new CheckBox(this);
        resume.setText("Afficher « Reprendre » (dernier fichier ouvert)");
        resume.setTextColor(0xFF2A1A1C);
        resume.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        resume.setMinHeight(dp(48));
        resume.setChecked(p.getBoolean("resume_" + widgetId, true));
        col.addView(resume);

        col.addView(label("Raccourcis"));
        final Spinner[] slots = new Spinner[4];
        for (int i = 0; i < 4; i++) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            TextView t = new TextView(this);
            t.setText("Bouton " + (i + 1));
            t.setTextColor(0xFF75605F);
            t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            t.setMinWidth(dp(90));
            row.addView(t);
            Spinner s = new Spinner(this);
            ArrayAdapter<String> ad = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, PliageWidget.LABELS);
            ad.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            s.setAdapter(ad);
            s.setSelection(PliageWidget.indexOf(p.getString("slot" + i + "_" + widgetId, PliageWidget.DEFAULT_SLOTS[i])));
            s.setMinimumHeight(dp(48));
            row.addView(s, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            slots[i] = s;
            col.addView(row);
        }

        Button save = new Button(this);
        save.setText("Valider");
        save.setAllCaps(false);
        save.setTextColor(Color.WHITE);
        save.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable g = new GradientDrawable();
        g.setColor(0xFF7B1E2B);
        g.setCornerRadius(dp(12));
        save.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(28);
        col.addView(save, lp);

        save.setOnClickListener(view -> {
            SharedPreferences.Editor ed = p.edit();
            int checked = themes.getCheckedRadioButtonId();
            int ti = checked >= 1000 ? checked - 1000 : 0;
            ed.putString("theme_" + widgetId, PliageWidget.THEMES[Math.max(0, Math.min(PliageWidget.THEMES.length - 1, ti))]);
            ed.putBoolean("resume_" + widgetId, resume.isChecked());
            for (int i = 0; i < 4; i++) ed.putString("slot" + i + "_" + widgetId, PliageWidget.KEYS[slots[i].getSelectedItemPosition()]);
            ed.apply();
            PliageWidget.update(this, AppWidgetManager.getInstance(this), widgetId);
            Intent result = new Intent();
            result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            setResult(RESULT_OK, result);
            finish();
        });

        setContentView(scroll);
    }

    private TextView label(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(0xFF7B1E2B);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(22), 0, dp(6));
        return t;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
