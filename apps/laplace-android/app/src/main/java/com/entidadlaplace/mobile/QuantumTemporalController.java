package com.entidadlaplace.mobile;
import android.content.Context;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** One serialized writer; no network, orders, arbitrary paths or host learner. */
public final class QuantumTemporalController {
    public interface Listener {void receive(String id,JSONObject payload);}
    private final Context context;
    private final Listener listener;
    private static final Object WRITER=new Object();
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    public QuantumTemporalController(Context context,Listener listener){this.context=context;this.listener=listener;}
    @JavascriptInterface public void request(String id,String action,String json){
        if(id==null||!id.matches("[A-Za-z0-9-]{1,80}"))return;
        io.execute(()->{
            synchronized(WRITER){ // Also serialize an old and a recreated Activity.
            JSONObject answer=new JSONObject();
            try{
                if(json==null||json.length()>8*1024*1024)throw new IllegalArgumentException("Solicitud LQT demasiado grande");
                JSONObject payload=new JSONObject(json);CampaignStore store=new CampaignStore(context.getFilesDir());
                JSONObject result;
                if("analyze".equals(action)){
                    String asset=payload.getString("asset");int g=payload.getInt("granularity"),minutes=payload.getInt("minutes");
                    String key=CampaignStore.key(asset,g,minutes);JSONObject old=store.read(key);boolean bundled=false;
                    if(old==null){
                        try(InputStream input=context.getAssets().open("campaign-models/"+key+".json.gz.b64")){
                            ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int count;
                            while((count=input.read(buffer))!=-1){if(bytes.size()+count>1024*1024)throw new IllegalStateException("Modelo incluido demasiado grande");bytes.write(buffer,0,count);}
                            byte[] compressed=android.util.Base64.decode(bytes.toByteArray(),android.util.Base64.DEFAULT);
                            ByteArrayOutputStream decoded=new ByteArrayOutputStream();
                            try(java.util.zip.GZIPInputStream gzip=new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(compressed))){
                                while((count=gzip.read(buffer))!=-1){if(decoded.size()+count>1024*1024)throw new IllegalStateException("Modelo descomprimido demasiado grande");decoded.write(buffer,0,count);}
                            }
                            old=new JSONObject(new String(decoded.toByteArray(),StandardCharsets.UTF_8));CampaignStore.validate(old);bundled=true;
                        }catch(java.io.FileNotFoundException absent){}
                    }
                    String template;
                    try(InputStream input=context.getAssets().open("lqc-native.xi")){
                        ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[2048];int count;
                        while((count=input.read(buffer))!=-1){
                            if(bytes.size()+count>8192)throw new IllegalStateException("Plantilla LQT demasiado grande");
                            bytes.write(buffer,0,count);
                        }
                        template=new String(bytes.toByteArray(),StandardCharsets.UTF_8);
                    }
                    if(!CampaignStore.sha256(template).equals(LQTCampaignBuild.TEMPLATE_SHA256))throw new IllegalStateException("Plantilla LQT alterada");
                    String source=CampaignCompiler.compile(asset,g,minutes,payload.getJSONArray("rows"),
                        System.currentTimeMillis()/1000,template);
                    result=new JSONObject(NativeQuantumTemporal.executeProgram(source,old==null?"":old.getString("checkpoint")));
                    String checkpoint=result.getString("checkpoint"),hash=CampaignStore.sha256(checkpoint);
                    JSONObject saved=new JSONObject().put("schema","laplace-campaign-checkpoint-v1").put("asset",asset)
                        .put("granularity",g).put("minutes",minutes).put("kernelSHA256",LQTCampaignBuild.KERNEL_SHA256)
                        .put("checkpointSHA256",hash).put("checkpoint",checkpoint);
                    store.write(key,saved);
                    result.remove("checkpoint");result.put("checkpointSHA256",hash).put("kernelSHA256",LQTCampaignBuild.KERNEL_SHA256)
                        .put("programSHA256",CampaignStore.sha256(source)).put("minutes",minutes).put("checkpointSaved",true).put("pretrainedLoaded",bundled);
                }else if("backup".equals(action)){
                    String key=CampaignStore.key(payload.getString("asset"),payload.getInt("granularity"),payload.getInt("minutes"));
                    JSONObject saved=store.read(key);if(saved==null)throw new IllegalStateException("Este activo y plazo aún no tienen aprendizaje guardado");
                    result=saved;
                }else if("restore".equals(action)){
                    JSONObject saved=payload.getJSONObject("model");
                    if("laplace-lqt-checkpoint-v1".equals(saved.optString("schema"))){
                        QuantumTemporalStore.validate(saved);QuantumTemporalStore legacy=new QuantumTemporalStore(context.getFilesDir());
                        String oldKey=QuantumTemporalStore.key(saved.getString("asset"),saved.getInt("granularity"),saved.getInt("minutes"));
                        JSONObject existingOld=legacy.read(oldKey);
                        if(existingOld!=null&&!existingOld.getString("checkpointSHA256").equals(saved.getString("checkpointSHA256")))throw new IllegalStateException("Se conserva el aprendizaje anterior que ya existe");
                        NativeQuantumTemporal.validateCheckpoint(saved.getString("checkpoint"),saved.getString("asset"),saved.getInt("granularity"),saved.getInt("minutes"),MarketCatalog.isEquity(saved.getString("asset")),System.currentTimeMillis()/1000);
                        if(existingOld==null)legacy.write(oldKey,saved);
                        answer.put("ok",true).put("result",new JSONObject().put("restored",existingOld==null).put("legacyPreserved",true));listener.receive(id,answer);return;
                    }
                    CampaignStore.validate(saved);
                    String key=CampaignStore.key(saved.getString("asset"),saved.getInt("granularity"),saved.getInt("minutes"));
                    JSONObject existing=store.read(key);
                    if(existing!=null&&!existing.getString("checkpointSHA256").equals(saved.getString("checkpointSHA256")))
                        throw new IllegalStateException("Ya existe otro aprendizaje local para este activo y plazo; se conserva el actual");
                    NativeQuantumTemporal.validateCheckpoint(saved.getString("checkpoint"),saved.getString("asset"),
                        saved.getInt("granularity"),saved.getInt("minutes"),MarketCatalog.isEquity(saved.getString("asset")),System.currentTimeMillis()/1000);
                    if(existing==null)store.write(key,saved);
                    result=new JSONObject().put("restored",existing==null).put("alreadyPresent",existing!=null);
                }else throw new IllegalArgumentException("Acción LQT no permitida");
                answer.put("ok",true).put("result",result);
            }catch(Exception|LinkageError error){try{answer.put("ok",false).put("error",friendly(error));}catch(Exception ignored){}}
            listener.receive(id,answer);
            }
        });
    }
    private static String friendly(Throwable error){
        String text=String.valueOf(error.getMessage());
        if(text.contains("insufficient mature")||text.contains("independent calibration/test"))
            return "Faltan suficientes períodos históricos separados para aprender y probar este plazo. Elige un plazo más corto.";
        if(text.contains("insufficient continuous temporal context"))
            return "Faltan 224 velas continuas recientes. Hay un hueco o falta contexto en el historial.";
        if(text.contains("future period already expired"))
            return "El último cierre es demasiado antiguo para este plazo. Actualiza los datos.";
        if(text.contains("checkpoint context mismatch"))
            return "El aprendizaje guardado no corresponde a este activo, resolución y plazo.";
        return text;
    }
    public void close(){io.shutdown();}
}
