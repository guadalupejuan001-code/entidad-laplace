package com.reversepc.os;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Insets;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import android.os.SystemClock;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.*;

/** Packaged Laplace presentation.
 * M001 price math remains packaged in JS; XN01 direction executes in an isolated
 * NativeRuntime XI/Ether state. No account, order, node server or shared desktop-checkpoint mutation. */
public final class LaplaceActivity extends Activity {
    private static final String HOST="laplace.reverse.local";
    private static final int LIMIT=2*1024*1024,EXPORT=9410;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor pool=new ThreadPoolExecutor(2,2,20,TimeUnit.SECONDS,
        new ArrayBlockingQueue<Runnable>(24));
    private volatile boolean closed;
    private WebView web;
    private byte[] exportBytes;
    private AtomicFile saved;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        saved=new AtomicFile(new File(getFilesDir(),"laplace-m001-captura.json"));
        web=new WebView(this);web.setBackgroundColor(0xff0b1016);
        // Target SDK 35 is edge-to-edge. Reserve the actual system/cutout/IME
        // insets in the native parent rather than drawing buttons beneath bars.
        if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE|
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(0xff0b1016);
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        root.setOnApplyWindowInsetsListener((view,insets)->{
            if(Build.VERSION.SDK_INT>=30){
                Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|
                    WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());
                root.setPadding(safe.left,safe.top,safe.right,safe.bottom);
                return WindowInsets.CONSUMED;
            }
            int left=insets.getSystemWindowInsetLeft(),top=insets.getSystemWindowInsetTop(),
                right=insets.getSystemWindowInsetRight(),bottom=insets.getSystemWindowInsetBottom();
            if(insets.getDisplayCutout()!=null){
                left=Math.max(left,insets.getDisplayCutout().getSafeInsetLeft());
                top=Math.max(top,insets.getDisplayCutout().getSafeInsetTop());
                right=Math.max(right,insets.getDisplayCutout().getSafeInsetRight());
                bottom=Math.max(bottom,insets.getDisplayCutout().getSafeInsetBottom());
            }
            root.setPadding(left,top,right,bottom);
            return insets.consumeSystemWindowInsets();
        });
        setContentView(root);root.requestApplyInsets();
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setBlockNetworkLoads(true);
        s.setSupportMultipleWindows(false);s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.addJavascriptInterface(new Bridge(),"LaplaceNative");
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return asset(r.getUrl());}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !trusted(r.getUrl());}
        });
        web.loadUrl("https://"+HOST+"/index.html");
    }
    static boolean trusted(Uri u){return "https".equals(u.getScheme())&&HOST.equals(u.getHost())&&
        (u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null;}
    private WebResourceResponse asset(Uri u){
        try{
            if(!trusted(u)||u.getQuery()!=null)return denied();
            String p=u.getPath();if(p==null||"/".equals(p))p="/index.html";
            if(!p.matches("/[a-z0-9-]+\\.(html|css|mjs|js|json)"))return denied();
            String mime=p.endsWith(".html")?"text/html":p.endsWith(".css")?"text/css":p.endsWith(".json")?"application/json":"text/javascript";
            Map<String,String> h=new HashMap<>();
            h.put("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
            h.put("X-Content-Type-Options","nosniff");h.put("Cache-Control","no-store");
            return new WebResourceResponse(mime,"UTF-8",200,"OK",h,getAssets().open("laplace"+p));
        }catch(Exception e){return denied();}
    }
    private static WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",new HashMap<>(),new ByteArrayInputStream(new byte[0]));}
    private static String stockSymbol(JSONObject p)throws Exception{
        String symbol=p.getString("symbol").trim().toUpperCase(java.util.Locale.ROOT);
        if(!symbol.matches("[A-Z][A-Z0-9.^=-]{0,14}"))throw new IllegalArgumentException("Símbolo bursátil inválido");
        return symbol;
    }
    static String urlFor(String source,JSONObject p)throws Exception{
        String root="https://api.exchange.coinbase.com/products/";
        switch(source){
            case "ticker":return root+"BTC-USD/ticker";
            case "book":return root+"BTC-USD/book?level=2";
            case "trades":return root+"BTC-USD/trades";
            case "eth":return root+"ETH-USD/ticker";
            case "euro":return root+"BTC-EUR/ticker";
            case "noaa":return "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
            case "registro":return "https://raw.githubusercontent.com/guadalupejuan001-code/LaPlaceDIG/laplace-registro/seguimiento/resumen.json";
            case "global_u002":return "https://raw.githubusercontent.com/guadalupejuan001-code/LaPlaceDIG/laplace-registro/universo/global-latest.json";
            case "global_u003":return "https://raw.githubusercontent.com/guadalupejuan001-code/LaPlaceDIG/laplace-registro/universo/u003-latest.json";
            case "stock":{
                String symbol=stockSymbol(p),range=p.optString("range","1mo");
                if(!range.equals("5d")&&!range.equals("1mo")&&!range.equals("3mo"))throw new IllegalArgumentException("Rango bursátil inválido");
                return "https://query1.finance.yahoo.com/v8/finance/chart/"+java.net.URLEncoder.encode(symbol,"UTF-8")
                    +"?interval=5m&range="+java.net.URLEncoder.encode(range,"UTF-8")
                    +"&includePrePost=false&events=div%2Csplits";
            }
            case "candles":{
                int step=p.getInt("step");long start=p.getLong("start"),end=p.getLong("end");
                long now=System.currentTimeMillis()/1000;
                long maxAge=step==60||step==300?16L*86400L:
                    step==3600?47L*86400L:step==86400?1002L*86400L:0L;
                if(maxAge==0||start<0||end<=start||end-start>step*300L||
                   end>now+300||start<now-maxAge)
                    throw new IllegalArgumentException("Ventana de velas no permitida");
                return root+"BTC-USD/candles?granularity="+step+"&start="+java.net.URLEncoder.encode(Instant.ofEpochSecond(start).toString(),"UTF-8")+"&end="+java.net.URLEncoder.encode(Instant.ofEpochSecond(end).toString(),"UTF-8");
            }
            default:throw new IllegalArgumentException("Fuente no permitida");
        }
    }
    private JSONObject readPublic(String source,JSONObject p)throws Exception{
        final String target=urlFor(source,p);
        IOException last=null;
        for(int attempt=0;attempt<3;attempt++){
            HttpsURLConnection c=(HttpsURLConnection)new java.net.URL(target).openConnection();
            c.setConnectTimeout(9000);c.setReadTimeout(9000);c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);c.setRequestProperty("Accept","application/json");
            c.setRequestProperty("User-Agent","REVERSE-Laplace/2.0");
            try{
                int status=c.getResponseCode();
                if(status==429){
                    String retry=c.getHeaderField("Retry-After");long delay=900L*(attempt+1);
                    try{if(retry!=null)delay=Math.max(delay,Math.min(8000L,Long.parseLong(retry.trim())*1000L));}catch(Exception ignored){}
                    last=new IOException("Demasiadas solicitudes (HTTP 429)");
                    if(attempt<2){try{Thread.sleep(delay);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException("Consulta interrumpida",e);}continue;}
                    throw last;
                }
                if((status==502||status==503)&&attempt<2){
                    last=new IOException("Fuente temporalmente no disponible (HTTP "+status+")");
                    try{Thread.sleep(700L*(attempt+1));}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException("Consulta interrumpida",e);}
                    continue;
                }
                if(status!=200)throw new IOException("Fuente no disponible (HTTP "+status+")");
                if(c.getContentLengthLong()>LIMIT)throw new IOException("Respuesta fuera de presupuesto");
                ByteArrayOutputStream out=new ByteArrayOutputStream();
                try(InputStream in=c.getInputStream()){
                    byte[] buf=new byte[8192];int n;
                    while((n=in.read(buf))!=-1){if(out.size()+n>LIMIT)throw new IOException("Respuesta excesiva");out.write(buf,0,n);}
                }
                return new JSONObject().put("ok",true).put("text",out.toString("UTF-8"))
                    .put("received_at",Instant.now().toString()).put("source",source);
            }finally{c.disconnect();}
        }
        throw last==null?new IOException("Fuente no disponible"):last;
    }
    private String assetText(String path)throws Exception{
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        try(InputStream in=getAssets().open(path)){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);}
        return out.toString("UTF-8");
    }
    private JSONObject nativeX001(JSONObject request)throws Exception{
        String asset=request.getString("asset").trim().toUpperCase(java.util.Locale.ROOT);
        if(!asset.matches("[A-Z][A-Z0-9.^=-]{0,14}"))throw new IllegalArgumentException("Activo inválido");
        String program=LaplaceXiCompiler.compile(request.getJSONArray("bars"),assetText("laplace/x001-native.xi"));
        long started=SystemClock.elapsedRealtimeNanos();
        ResultPacket packet=ResultPacket.parse(NativeRuntime.execute(NativeRuntime.initialize(),program));
        long elapsed=SystemClock.elapsedRealtimeNanos()-started;
        JSONObject core=new JSONObject(NativeRuntime.inspect(packet.state));
        JSONObject result=LaplaceXiCompiler.parse(packet.output,asset,elapsed,core);
        result.put("program_sha256",sha(program));
        result.put("output_sha256",sha(packet.output));
        result.put("isolated",true);
        return new JSONObject().put("ok",true).put("result",result);
    }
    private JSONObject nativeU002(JSONObject capture)throws Exception{
        LaplaceGlobalCompiler.Compiled compiled=LaplaceGlobalCompiler.compile(
            capture,assetText("laplace/u002-native.xi"));
        long started=SystemClock.elapsedRealtimeNanos();
        ResultPacket packet=ResultPacket.parse(
            NativeRuntime.execute(NativeRuntime.initialize(),compiled.program));
        long elapsed=SystemClock.elapsedRealtimeNanos()-started;
        JSONObject core=new JSONObject(NativeRuntime.inspect(packet.state));
        JSONObject result=LaplaceGlobalCompiler.parse(packet.output,compiled,elapsed,core);
        result.put("program_sha256",sha(compiled.program));
        result.put("output_sha256",sha(packet.output));
        return new JSONObject().put("ok",true).put("result",result);
    }

    private static String sha(String text)throws Exception{
        byte[] b=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder h=new StringBuilder();for(byte x:b)h.append(String.format("%02x",x&255));return h.toString();
    }
    private synchronized JSONObject readSaved()throws Exception{
        if(!saved.getBaseFile().exists())return new JSONObject().put("ok",true).put("text",JSONObject.NULL);
        if(saved.getBaseFile().length()>LIMIT+1024)throw new IOException("Archivo local excesivo; no se modifica");
        JSONObject e=new JSONObject(new String(saved.readFully(),StandardCharsets.UTF_8));
        String text=e.getString("text");if(!sha(text).equals(e.getString("sha256")))throw new IOException("La captura local está alterada; no se borra");
        return new JSONObject().put("ok",true).put("text",text);
    }
    private synchronized JSONObject save(String text)throws Exception{
        if(text.getBytes(StandardCharsets.UTF_8).length>LIMIT)throw new IOException("Captura fuera de presupuesto");
        JSONObject p=new JSONObject(text);String schema=p.optString("schema");if(!"laplace-reverse-m001-v1".equals(schema)&&!"laplace-reverse-v2".equals(schema))throw new IOException("Captura incompatible");
        long at=Instant.parse(p.getString("at")).toEpochMilli();
        if(at>System.currentTimeMillis()+5000)throw new IOException("Captura futura");
        JSONObject previous=readSaved();
        if(!previous.isNull("text")&&at<=Instant.parse(new JSONObject(previous.getString("text")).getString("at")).toEpochMilli())
            throw new IOException("Captura anterior o repetida");
        JSONObject envelope=new JSONObject().put("text",text).put("sha256",sha(text));
        FileOutputStream out=null;
        try{out=saved.startWrite();out.write(envelope.toString().getBytes(StandardCharsets.UTF_8));saved.finishWrite(out);}
        catch(Exception e){if(out!=null)saved.failWrite(out);throw e;}
        return new JSONObject().put("ok",true);
    }
    private void complete(String id,JSONObject data){
        ui.post(()->{if(!closed)web.evaluateJavascript("window.LaplaceHost&&window.LaplaceHost.complete("+JSONObject.quote(id)+","+data+");",null);});
    }
    private void failure(String id,Exception e){
        try{complete(id,new JSONObject().put("ok",false).put("error",String.valueOf(e.getMessage())));}catch(Exception ignored){}
    }
    public final class Bridge {
        @JavascriptInterface public void request(String id,String operation,String payload){
            if(closed||id==null||!id.matches("[A-Za-z0-9_-]{1,60}")||payload==null||payload.length()>LIMIT)return;
            try{pool.execute(()->{
                try{
                    JSONObject result;
                    if("read".equals(operation))result=readSaved();
                    else if("save".equals(operation))result=save(payload);
                    else if("native_x001".equals(operation)){
                        if(payload.length()>LIMIT)throw new IOException("Entrada XN01 excesiva");
                        result=nativeX001(new JSONObject(payload));
                    }else if("native_u002".equals(operation)){
                        if(payload.length()>LIMIT)throw new IOException("Entrada U002 excesiva");
                        result=nativeU002(new JSONObject(payload));
                    }else if("public".equals(operation)){
                        if(payload.length()>1024)throw new IOException("Consulta excesiva");
                        JSONObject q=new JSONObject(payload);result=readPublic(q.getString("source"),q.optJSONObject("params")==null?new JSONObject():q.getJSONObject("params"));
                    }else throw new IOException("Operación no permitida");
                    complete(id,result);
                }catch(Exception e){failure(id,e);}
            });}catch(RejectedExecutionException e){failure(id,new IOException("Hay demasiadas consultas en curso"));}
        }
        @JavascriptInterface public void close(){ui.post(()->finish());}
        @JavascriptInterface public void export(String payload){
            if(payload==null||payload.getBytes(StandardCharsets.UTF_8).length>LIMIT)return;
            ui.post(()->{if(closed)return;try{
                exportBytes=payload.getBytes(StandardCharsets.UTF_8);
                startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json").putExtra(Intent.EXTRA_TITLE,"LAPLACE-consulta.json"),EXPORT);
            }catch(Exception e){Toast.makeText(LaplaceActivity.this,"No se pudo abrir la exportación",Toast.LENGTH_SHORT).show();}});
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=EXPORT)return;
        byte[] bytes=exportBytes;exportBytes=null;
        if(result!=RESULT_OK||data==null||data.getData()==null||bytes==null)return;
        try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new IOException();out.write(bytes);}
        catch(Exception e){Toast.makeText(this,"No se pudo guardar la exportación",Toast.LENGTH_SHORT).show();}
    }
    WebView testingWebView(){return web;}
    @Override protected void onPause(){super.onPause();web.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){closed=true;pool.shutdownNow();if(web!=null){web.removeJavascriptInterface("LaplaceNative");web.destroy();}super.onDestroy();}
}
