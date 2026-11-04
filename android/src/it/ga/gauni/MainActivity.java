package it.ga.gauni;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Guscio Android di GAUNI: una WebView che mostra l'app web pubblicata su GitHub Pages.
 * Ogni modifica pubblicata arriva sul telefono alla riapertura, senza reinstallare l'APK; il service
 * worker la tiene in memoria per l'uso offline. Qui resta solo ciò che la WebView da sola non sa fare:
 * salvare e condividere file (backup, calendario .ics), scegliere un file da ripristinare, il tasto
 * Indietro e l'aggiornamento dell'APK stesso. I dati (esami, voti, piano) restano nel telefono.
 */
public class MainActivity extends Activity {
    private static final String HOST = "gavao.github.io";
    private static final String HOME = "https://" + HOST + "/ga-uni/";
    private static final String OFFLINE_PAGE = "<html><body style='background:#0f1024;color:#eef0ff;"
            + "font-family:sans-serif;text-align:center;padding:40% 24px'>"
            + "<p>Per il primo avvio GAUNI ha bisogno della connessione a internet.</p>"
            + "<p><a href='" + HOME + "' style='color:#a78bfa'>Riprova</a></p></body></html>";
    private static final String FILE_DIR = Environment.DIRECTORY_DOWNLOADS + "/GAUNI";
    private static final int PICK_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF0F1024);
        getWindow().setNavigationBarColor(0xFF0F1024);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0F1024);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (HOST.equals(request.getUrl().getHost())) return false;
                openExternal(request.getUrl());   // i link esterni (es. Claude) si aprono fuori
                return true;
            }

            // Solo se l'app non è mai stata aperta online: dopo, la serve il service worker.
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) view.loadDataWithBaseURL(HOME, OFFLINE_PAGE, "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // <input type="file">: il backup da ripristinare.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {
                    startActivityForResult(pick, PICK_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        web.loadUrl(HOME);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_FILE || fileCallback == null) return;
        Uri picked = resultCode == RESULT_OK && data != null ? data.getData() : null;
        fileCallback.onReceiveValue(picked == null ? null : new Uri[]{picked});
        fileCallback = null;
    }

    /** Tasto Indietro: prima chiude la finestra aperta, poi torna alla pagina precedente, infine esce. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.appBack ? window.appBack() : false", handled -> {
            if ("true".equals(handled)) return;
            if (web.canGoBack()) web.goBack();
            else finish();
        });
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // nessuna app in grado di aprirlo
        }
    }

    /**
     * Scarica il nuovo APK con il gestore download di Android e, finito, apre l'installazione.
     * La prima volta Android chiede di consentire a GAUNI di installare app: si apre
     * l'impostazione apposita e, dopo averla attivata, basta toccare di nuovo "Aggiorna".
     */
    private void startUpdate(String url) {
        if (!getPackageManager().canRequestPackageInstalls()) {
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())));
            return;
        }
        DownloadManager downloads = getSystemService(DownloadManager.class);
        java.io.File old = new java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "GAUNI-update.apk");
        if (old.exists()) old.delete();
        long id = downloads.enqueue(new DownloadManager.Request(Uri.parse(url))
                .setTitle("Aggiornamento GAUNI")
                .setMimeType("application/vnd.android.package-archive")
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "GAUNI-update.apk")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE));

        BroadcastReceiver done = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                unregisterReceiver(this);
                Uri apk = downloads.getUriForDownloadedFile(id);
                if (apk == null) return;   // download non riuscito
                startActivity(new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(apk, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(done, filter, Context.RECEIVER_EXPORTED);
        else registerReceiver(done, filter);
    }

    /** Scrive un file di testo in Download/GAUNI e ne restituisce l'indirizzo. */
    private Uri writeFile(String name, String mime, String content) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, FILE_DIR);
        Uri target = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        try (OutputStream out = getContentResolver().openOutputStream(target, "wt")) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
        return target;
    }

    /** Funzioni native richiamabili dall'app web come window.Android. */
    private class Bridge {
        /** Versione dell'APK installato, es. "1.0": l'app web la confronta con l'ultima release su GitHub. */
        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "0";
            }
        }

        @JavascriptInterface
        public void installUpdate(String url) {
            runOnUiThread(() -> startUpdate(url));
        }

        /** Copia un testo negli appunti (le istruzioni per Claude). */
        @JavascriptInterface
        public boolean copyText(String text) {
            try {
                android.content.ClipboardManager cm = getSystemService(android.content.ClipboardManager.class);
                cm.setPrimaryClip(android.content.ClipData.newPlainText("GAUNI", text));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /**
         * Salva un file in Download/GAUNI (backup, calendario .ics) e lo passa al menu di condivisione di
         * Android: da lì si sceglie Google Calendar, Drive, email… Restituisce false se non riesce.
         */
        @JavascriptInterface
        public boolean shareFile(String name, String mime, String content) {
            try {
                Uri target = writeFile(name, mime, content);
                Intent send = new Intent(Intent.ACTION_SEND).setType(mime)
                        .putExtra(Intent.EXTRA_STREAM, target).putExtra(Intent.EXTRA_SUBJECT, name)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, name)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Apre un file (es. il calendario .ics) con l'app adatta: Calendario importa gli eventi. */
        @JavascriptInterface
        public boolean openFile(String name, String mime, String content) {
            try {
                Uri target = writeFile(name, mime, content);
                Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(target, mime)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                runOnUiThread(() -> {
                    try {
                        startActivity(view);
                    } catch (Exception e) {
                        shareFile(name, mime, content);
                    }
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
