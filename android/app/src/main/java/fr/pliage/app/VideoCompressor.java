package fr.pliage.app;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.OptIn;
import androidx.media3.common.Effect;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.effect.Presentation;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.ProgressHolder;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Compression vidéo avec Media3 Transformer : H.264 + AAC, hauteur et débit au choix. */
@OptIn(markerClass = UnstableApi.class)
class VideoCompressor {

    interface Callback {
        void onProgress(int percent);

        void onDone(long size);

        void onError(String message);
    }

    private final Context ctx;
    private final Callback cb;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Transformer transformer;
    private boolean finished = false;
    private String outPath;

    VideoCompressor(Context ctx, Callback cb) {
        this.ctx = ctx;
        this.cb = cb;
    }

    void start(String in, String out, int height, int bitrate, boolean removeAudio) {
        outPath = out;
        try {
            VideoEncoderSettings.Builder vs = new VideoEncoderSettings.Builder();
            if (bitrate > 0) vs.setBitrate(bitrate);
            DefaultEncoderFactory enc = new DefaultEncoderFactory.Builder(ctx)
                    .setRequestedVideoEncoderSettings(vs.build())
                    .setEnableFallback(true)
                    .build();
            transformer = new Transformer.Builder(ctx)
                    .setVideoMimeType(MimeTypes.VIDEO_H264)
                    .setAudioMimeType(MimeTypes.AUDIO_AAC)
                    .setEncoderFactory(enc)
                    .addListener(new Transformer.Listener() {
                        @Override
                        public void onCompleted(Composition composition, ExportResult exportResult) {
                            finished = true;
                            cb.onProgress(100);
                            cb.onDone(new File(outPath).length());
                        }

                        @Override
                        public void onError(Composition composition, ExportResult exportResult, ExportException exportException) {
                            finished = true;
                            //noinspection ResultOfMethodCallIgnored
                            new File(outPath).delete();
                            String m = exportException.getMessage();
                            cb.onError("Compression impossible" + (m == null ? "" : " (" + m + ")"));
                        }
                    })
                    .build();
            List<Effect> fx = new ArrayList<>();
            if (height > 0) fx.add(Presentation.createForHeight(height));
            List<AudioProcessor> audio = new ArrayList<>();
            EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(new File(in))))
                    .setRemoveAudio(removeAudio)
                    .setEffects(new Effects(audio, fx))
                    .build();
            transformer.start(item, out);
            poll();
        } catch (Exception e) {
            finished = true;
            cb.onError(PliagePlugin.msg(e, "Compression impossible"));
        }
    }

    private void poll() {
        handler.postDelayed(() -> {
            if (finished || transformer == null) return;
            ProgressHolder ph = new ProgressHolder();
            if (transformer.getProgress(ph) == Transformer.PROGRESS_STATE_AVAILABLE) cb.onProgress(ph.progress);
            poll();
        }, 500);
    }

    void cancel() {
        if (transformer != null && !finished) {
            finished = true;
            transformer.cancel();
            //noinspection ResultOfMethodCallIgnored
            new File(outPath).delete();
            cb.onError("Compression annulée");
        }
    }
}
