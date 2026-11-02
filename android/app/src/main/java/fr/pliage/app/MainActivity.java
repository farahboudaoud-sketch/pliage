package fr.pliage.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PliagePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
