package com.entidadlaplace.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.ViewGroup;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.TreeMap;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Independiente de REVERSE-PC; WebView sirve solo archivos internos.
 * Criptomonedas: Coinbase público. Acciones/ETF: Yahoo Chart no oficial,
 * indicativo y posiblemente demorado. Ninguna integración con una cuenta.
 * M001 usa análogos solo con historia cerrada; sin acceso a dinero.
 * Robinhood Crypto añade operaciones manuales mediante su API oficial.
 * La semilla privada permanece cifrada en Android Keystore; cada envío exige confirmación nativa.
 */
public final class MainActivity extends Activity {
    private WebView webView;
    private CoinbaseLiveFeed liveFeed;
    private RobinhoodController robinhood;
    private final ExecutorService io=Executors.newFixedThreadPool(4);
    private static final int MAX_NETWORK_BYTES=2*1024*1024;
    private static final int MAX_QUOTE_BYTES=64*1024;
    private static final int EXPORT_HISTORY=812;
    private String pendingExport;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(16,19,24));
        getWindow().setNavigationBarColor(Color.rgb(16,19,24));
        webView=new WebView(this);
        webView.setBackgroundColor(Color.rgb(16,19,24));
        webView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings=webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        // Sólo se reproduce el video decorativo local y sin sonido.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,
                WebResourceRequest request){
                Uri uri=request.getUrl();
                if("file".equals(uri.getScheme())&&
                    "android_asset".equals(uri.getHost()))return false;
                if("https".equals(uri.getScheme())){
                    Intent open=new Intent(Intent.ACTION_VIEW,uri);
                    try{startActivity(open);}catch(Exception ignored){}
                }
                return true;
            }
        });
        liveFeed=new CoinbaseLiveFeed(this::emitLiveEvent);
        robinhood=new RobinhoodController(this,(id,payload)->runOnUiThread(()->{
            if(webView!=null)webView.evaluateJavascript("window.LaplaceBroker&&window.LaplaceBroker.receive("+
                JSONObject.quote(id)+","+payload.toString()+")",null);
        }));
        webView.addJavascriptInterface(new MarketBridge(),"LaplaceBridge");
        webView.addJavascriptInterface(new LiveBridge(),"LaplaceLiveBridge");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    /**
     * Dedicated, fixed-endpoint and read-only WebSocket control.
     * No arbitrary URL, credentials, brokerage account or order methods.
     */
    private final class LiveBridge {
        @JavascriptInterface
        public void start(){
            if(liveFeed!=null)liveFeed.start();
        }
        @JavascriptInterface
        public void stop(){
            if(liveFeed!=null)liveFeed.stop();
        }
    }

    private void emitLiveEvent(JSONObject payload){
        if(payload==null)return;
        final String js="window.LaplaceMobile&&window.LaplaceMobile.live("+
            payload.toString()+")";
        runOnUiThread(()->{
            if(webView!=null)webView.evaluateJavascript(js,null);
        });
    }

    @Override protected void onResume(){
        super.onResume();
        if(webView!=null)webView.onResume();
        if(liveFeed!=null)liveFeed.resume();
    }

    @Override protected void onPause(){
        if(liveFeed!=null)liveFeed.pause();
        if(webView!=null)webView.onPause();
        super.onPause();
    }

    private final class MarketBridge {
        @JavascriptInterface
        public void brokerCommand(String requestId,String action,String json){
            if(robinhood!=null)robinhood.command(requestId,action,json);
        }

        @JavascriptInterface
        public void fetchEF004Archive(String requestId){
            if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}"))return;
            io.execute(()->{
                try{JSONObject result=EF004Archive.download((done,total)->{
                    runOnUiThread(()->{if(webView!=null)webView.evaluateJavascript(
                        "window.LaplaceEF004Archive&&window.LaplaceEF004Archive.progress("+
                        JSONObject.quote(requestId)+","+done+","+total+")",null);});
                });emitEF004Archive(requestId,result);}
                catch(Exception error){try{emitEF004Archive(requestId,new JSONObject().put("ok",false)
                    .put("error",error.getMessage()));}catch(Exception ignored){}}
            });
        }

        @JavascriptInterface
        public void exportHistory(String json){
            if(json==null||json.length()>8*1024*1024){
                exportFeedback("El registro excede el tamaño de exportación permitido.");return;
            }
            runOnUiThread(()->{
                if(pendingExport!=null){exportFeedback("Ya hay una exportación abierta.");return;}
                pendingExport=json;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE,"LAPLACE-registro.json");
                try{startActivityForResult(intent,EXPORT_HISTORY);}
                catch(Exception error){pendingExport=null;exportFeedback("No se pudo abrir el selector de archivos.");}
            });
        }
        @JavascriptInterface
        public void fetchCandles(String requestId,String asset,int granularity,int days){
            int expectedDays=MarketCatalog.days(granularity,asset);
            if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}")||
               !MarketCatalog.allowed(asset)||expectedDays<0||days!=expectedDays){
                emit(requestId,"Solicitud inválida: fuente o ventana no permitida.",null,granularity);
                return;
            }
            io.execute(()->{
                try{
                    JSONArray candles;
                    if(MarketCatalog.isCrypto(asset))
                        candles=fetchCoinbaseHistory(requestId,asset,granularity,days);
                    else{
                        candles=EquityHistory.history(asset,granularity);
                        emitProgress(requestId,1,1);
                    }
                    emit(requestId,null,candles,granularity);
                }catch(Exception error){
                    emit(requestId,"Histórico: "+error.getMessage(),null,granularity);
                }
            });
        }
        @JavascriptInterface
        public void analyzeXN01(String requestId,String asset,String barsJson){
            if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}")||
               !"BTC-USD".equals(asset)||barsJson==null||barsJson.length()>100000){
                emitXN01(requestId,"XN01: datos no permitidos",null);return;
            }
            io.execute(()->{
                try{
                    JSONArray rows=new JSONArray(barsJson);
                    if(rows.length()<64||rows.length()>240)
                        throw new IllegalArgumentException("XN01 exige entre 64 y 240 velas");
                    String xi;
                    try(InputStream in=getAssets().open("xn01-native.xi")){
                        ByteArrayOutputStream out=new ByteArrayOutputStream();
                        byte[] buffer=new byte[4096];int n;
                        while((n=in.read(buffer))!=-1){
                            if(out.size()+n>16000)
                                throw new IOException("Plantilla XI demasiado grande");
                            out.write(buffer,0,n);
                        }
                        xi=out.toString(StandardCharsets.UTF_8.name());
                    }
                    JSONObject result=NativeXN01.analyze(asset,rows,xi);
                    emitXN01(requestId,null,result);
                }catch(Exception e){
                    emitXN01(requestId,"XN01 nativo: "+e.getMessage(),null);
                }catch(LinkageError e){
                    emitXN01(requestId,"XN01 JNI ausente o incompatible",null);
                }
            });
        }
        @JavascriptInterface
        public void fetchQuote(String requestId,String asset){
            if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}")||
               !MarketCatalog.allowed(asset)){
                emitQuote(requestId,"Activo no permitido.",null);
                return;
            }
            io.execute(()->{
                try{emitQuote(requestId,null,
                    MarketCatalog.isCrypto(asset)?
                        fetchCoinbaseQuote(asset):EquityHistory.quote(asset));}
                catch(Exception e){emitQuote(requestId,e.getMessage(),null);}
            });
        }
    }
    private static JSONObject fetchCoinbaseQuote(String asset) throws Exception {
        final String api="https://api.exchange.coinbase.com/products/"+asset+"/ticker";
        HttpURLConnection conn=(HttpURLConnection)new URL(api).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(14000);
        conn.setReadTimeout(17000);
        conn.setRequestProperty("Accept","application/json");
        conn.setRequestProperty("User-Agent","EntidadLaplaceAndroid/3.2 (public market research)");
        try {
            int code=conn.getResponseCode();
            if(code!=200)throw new IOException("Cotización: HTTP "+code+
                (code==429?" (límite de solicitudes)":""));
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            try(InputStream input=conn.getInputStream()){
                byte[] block=new byte[4096];
                int len;
                while((len=input.read(block))!=-1){
                    if(bytes.size()+len>MAX_QUOTE_BYTES)
                        throw new IOException("Respuesta de cotización demasiado grande");
                    bytes.write(block,0,len);
                }
            }
            JSONObject raw=new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            double price=Double.parseDouble(raw.getString("price"));
            if(!Double.isFinite(price)||price<=0||price>1e10)
                throw new IOException("Cotización numéricamente inválida");
            JSONObject result=new JSONObject();
            result.put("asset",asset);
            result.put("price",price);
            result.put("time",raw.optString("time",""));
            result.put("receivedAt",System.currentTimeMillis());
            result.put("source","Coinbase Exchange · ticker público");
            result.put("market","crypto");
            result.put("indicative",false);
            return result;
        }finally{conn.disconnect();}
    }
    // 14 días de 5m; 45 días de 1h; 1000 días de 1d.
    // Cada consulta a Coinbase tiene una ventana <300 velas. Nunca se inventan
    // velas faltantes ni se mezcla un activo con otro al cambiar la selección.
    private JSONArray fetchCoinbaseHistory(String requestId,String asset,
            int granularity,int days) throws Exception {
        long end=(System.currentTimeMillis()/1000L/granularity)*granularity;
        long earliest=end-days*86400L;
        int total=(int)Math.ceil((end-earliest)/(280.0*granularity));
        if(total<1||total>20)throw new IOException("Presupuesto de consultas excedido");
        TreeMap<Long,JSONArray> candles=new TreeMap<>();
        int count=0;
        while(end>earliest){
            long start=Math.max(earliest,end-280L*granularity);
            JSONArray page=fetchCoinbaseWindow(asset,granularity,start,end);
            for(int k=0;k<page.length();k++){
                JSONArray bar=page.optJSONArray(k);
                if(bar==null||bar.length()<6)continue;
                long t=bar.optLong(0,-1);
                // Solo velas cerradas, dentro de la ventana solicitada.
                if(t>=start&&t<end&&t%granularity==0&&
                   t+granularity*1L<=System.currentTimeMillis()/1000L){
                    JSONArray before=candles.putIfAbsent(t,bar);
                    if(before!=null&&!before.toString().equals(bar.toString()))
                        throw new IOException("Velas contradictorias desde la fuente");
                }
            }
            count++;
            emitProgress(requestId,count,total);
            end=start;
            if(end>earliest)Thread.sleep(130);
        }
        if(candles.size()<10)throw new IOException("Historial verificado insuficiente");
        if(candles.size()>5000)throw new IOException("Exceso de velas recibidas");
        JSONArray ordered=new JSONArray();
        for(JSONArray bar:candles.values())ordered.put(bar);
        return ordered;
    }
    private static JSONArray fetchCoinbaseWindow(String asset,int granularity,
            long from,long to) throws Exception {
        final String api="https://api.exchange.coinbase.com/products/"+asset+
          "/candles?granularity="+granularity+
          "&start="+Instant.ofEpochSecond(from).toString()+
          "&end="+Instant.ofEpochSecond(to).toString();
        IOException latest=null;
        for(int attempt=0;attempt<2;attempt++){
            HttpURLConnection conn=(HttpURLConnection)new URL(api).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(11000);
            conn.setRequestProperty("Accept","application/json");
            conn.setRequestProperty("User-Agent","EntidadLaplaceAndroid/3.2 (public market research)");
            try{
                int code=conn.getResponseCode();
                if(code==429&&attempt==0){
                    latest=new IOException("Coinbase HTTP 429: límite de consultas");
                }else if(code!=200){
                    throw new IOException("Coinbase HTTP "+code+" (no usar datos inventados)");
                }else{
                    ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                    try(InputStream input=conn.getInputStream()){
                        byte[] block=new byte[8192];int len;
                        while((len=input.read(block))!=-1){
                            if(bytes.size()+len>MAX_NETWORK_BYTES)
                                throw new IOException("Demasiados bytes del proveedor");
                            bytes.write(block,0,len);
                        }
                    }
                    JSONArray result=new JSONArray(bytes.toString(StandardCharsets.UTF_8.name()));
                    if(result.length()>300)throw new IOException("Respuesta inesperada: más de 300 velas");
                    return result;
                }
            }finally{conn.disconnect();}
            if(latest!=null&&attempt==0)Thread.sleep(1200);
        }
        throw latest==null?new IOException("Fuente no disponible"):latest;
    }
    private void emitProgress(String requestId,int done,int total){
        if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}"))return;
        final String javascript="window.LaplaceMobile&&window.LaplaceMobile.progress("+
            JSONObject.quote(requestId)+","+done+","+total+")";
        runOnUiThread(()->{if(webView!=null)webView.evaluateJavascript(javascript,null);});
    }
    private void emitXN01(String requestId,String error,JSONObject result){
        if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}"))return;
        try{
            JSONObject msg=new JSONObject();
            msg.put("ok",error==null);
            if(error==null)msg.put("xn01",result);
            else msg.put("error",error);
            String js="window.LaplaceMobile&&window.LaplaceMobile.receive("+
                JSONObject.quote(requestId)+","+msg.toString()+")";
            runOnUiThread(()->{
                if(webView!=null)webView.evaluateJavascript(js,null);
            });
        }catch(Exception ignored){}
    }

    private void emitQuote(String requestId,String error,JSONObject quote){
        if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}"))return;
        try {
            JSONObject message=new JSONObject();
            message.put("ok",error==null);
            if(error==null)message.put("quote",quote);
            else message.put("error",error);
            final String js="window.LaplaceMobile&&window.LaplaceMobile.receive("+
                JSONObject.quote(requestId)+","+message.toString()+")";
            runOnUiThread(()->{
                if(webView!=null)webView.evaluateJavascript(js,null);
            });
        }catch(Exception ignored){}
    }
    private void emit(String requestId,String error,JSONArray candles,int granularity){
        if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}"))return;
        try {
            JSONObject msg=new JSONObject();
            msg.put("ok",error==null);
            msg.put("granularity",granularity);
            if(error==null)msg.put("candles",candles);
            else msg.put("error",error);
            final String javascript="window.LaplaceMobile&&window.LaplaceMobile.receive("+
                JSONObject.quote(requestId)+","+msg.toString()+")";
            runOnUiThread(()->{
                if(webView!=null)webView.evaluateJavascript(javascript,null);
            });
        }catch(Exception ignored){}
    }
    private void emitEF004Archive(String id,JSONObject payload){
        runOnUiThread(()->{if(webView!=null)webView.evaluateJavascript(
            "window.LaplaceEF004Archive&&window.LaplaceEF004Archive.receive("+
            JSONObject.quote(id)+","+payload.toString()+")",null);});
    }
    private void exportFeedback(String message){
        runOnUiThread(()->{
            if(webView!=null)webView.evaluateJavascript(
                "window.LaplaceExportResult&&window.LaplaceExportResult("+
                JSONObject.quote(message)+")",null);
        });
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode!=EXPORT_HISTORY)return;
        final String json=pendingExport;pendingExport=null;
        if(resultCode!=RESULT_OK||data==null||data.getData()==null){
            exportFeedback("Exportación cancelada. Tu registro sigue guardado.");return;
        }
        final Uri destination=data.getData();
        io.execute(()->{
            try(OutputStream out=getContentResolver().openOutputStream(destination,"wt")){
                if(out==null||json==null)throw new IOException("Archivo no disponible");
                out.write(json.getBytes(StandardCharsets.UTF_8));
                exportFeedback("Registro exportado con sus cifras originales.");
            }catch(Exception error){exportFeedback("No se pudo exportar el archivo. Tu registro sigue guardado.");}
        });
    }
    @Override public void onBackPressed(){
        if(webView==null){super.onBackPressed();return;}
        webView.evaluateJavascript("Boolean(window.LaplaceNavigation&&window.LaplaceNavigation.back())",
            handled->{if(!"true".equals(handled))MainActivity.super.onBackPressed();});
    }
    @Override protected void onDestroy(){
        if(robinhood!=null){robinhood.shutdown();robinhood=null;}
        if(liveFeed!=null){
            liveFeed.shutdown();
            liveFeed=null;
        }
        io.shutdownNow();
        if(webView!=null){
            webView.removeJavascriptInterface("LaplaceBridge");
            webView.removeJavascriptInterface("LaplaceLiveBridge");
            webView.loadUrl("about:blank");
            webView.destroy();
            webView=null;
        }
        super.onDestroy();
    }
}
