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
 * Entrada de mercado exclusivamente desde endpoint público de Coinbase.
 * M001 (análisis de análogos) se ejecuta en engine.js sin acceso a cuentas.
 * No hay APIs para cuentas, órdenes o claves privadas.
 */
public final class MainActivity extends Activity {
    private WebView webView;
    private final ExecutorService io=Executors.newFixedThreadPool(4);
    private static final Set<String> ASSETS = new HashSet<>(Arrays.asList(
        "BTC-USD","ETH-USD","SOL-USD"
    ));
    private static final int MAX_NETWORK_BYTES=2*1024*1024;
    private static final int MAX_QUOTE_BYTES=64*1024;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(6,17,30));
        getWindow().setNavigationBarColor(Color.rgb(6,17,30));
        webView=new WebView(this);
        webView.setBackgroundColor(Color.rgb(6,16,29));
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
        settings.setMediaPlaybackRequiresUserGesture(true);
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
        webView.addJavascriptInterface(new MarketBridge(),"LaplaceBridge");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private final class MarketBridge {
        @JavascriptInterface
        public void fetchCandles(String requestId,String asset,int granularity,int days){
            int expectedDays=granularity==300?14:granularity==3600?50:
                granularity==86400?300:-1;
            if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}")||
               !ASSETS.contains(asset)||expectedDays<0||days!=expectedDays){
                emit(requestId,"Solicitud inválida: fuente o ventana no permitida.",null,granularity);
                return;
            }
            io.execute(()->{
                try{
                    JSONArray candles=fetchCoinbaseHistory(requestId,asset,granularity,days);
                    emit(requestId,null,candles,granularity);
                }catch(Exception error){
                    emit(requestId,"Histórico: "+error.getMessage(),null,granularity);
                }
            });
        }
        @JavascriptInterface
        public void fetchQuote(String requestId,String asset){
            if(requestId==null||!requestId.matches("[A-Za-z0-9-]{1,80}")||
               !ASSETS.contains(asset)){
                emitQuote(requestId,"Activo no permitido.",null);
                return;
            }
            io.execute(()->{
                try{emitQuote(requestId,null,fetchCoinbaseQuote(asset));}
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
        conn.setRequestProperty("User-Agent","EntidadLaplaceAndroid/2.0 (public market research)");
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
            return result;
        }finally{conn.disconnect();}
    }
    // 14 días de 5m; 50 días de 1h; 300 días de 1d.
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
            conn.setRequestProperty("User-Agent","EntidadLaplaceAndroid/2.0 (public market research)");
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
    @Override protected void onDestroy(){
        io.shutdownNow();
        if(webView!=null){
            webView.removeJavascriptInterface("LaplaceBridge");
            webView.loadUrl("about:blank");
            webView.destroy();
            webView=null;
        }
        super.onDestroy();
    }
}
