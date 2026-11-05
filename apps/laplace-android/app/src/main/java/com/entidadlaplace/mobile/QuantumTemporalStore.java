package com.entidadlaplace.mobile;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Locale;
/** Atomic, context-specific checkpoints. A failed write preserves old learning. */
public final class QuantumTemporalStore {
    private final File directory;
    public QuantumTemporalStore(File root)throws Exception{
        // The old directory remains intact; its uncentered LQT1 parameters
        // cannot be interpreted as centered LQT2 parameters or optimizer state.
        directory=new File(root,"lqt1000-v2");
        if(!directory.isDirectory()&&!directory.mkdirs())throw new java.io.IOException("No se pudo abrir el aprendizaje local");
    }
    public static String key(String asset,int g,int minutes){
        int h=QuantumTemporalCompiler.horizon(asset,g,minutes);return asset+"-"+g+"-"+h;
    }
    public static String sha256(String value)throws Exception{
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();
    }
    private File file(String key){
        if(key==null||!key.matches("[A-Za-z0-9-]{3,64}"))throw new IllegalArgumentException("Identificador LQT inválido");
        return new File(directory,key+".json");
    }
    public synchronized JSONObject read(String key)throws Exception{
        File f=file(key);if(!f.exists())return null;
        if(f.length()>1024*1024)throw new IllegalStateException("Checkpoint LQT fuera del límite");
        JSONTokener tokens=new JSONTokener(new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8));
        JSONObject value=new JSONObject(tokens);
        if(tokens.nextClean()!=0)throw new IllegalStateException("Checkpoint LQT con contenido adicional");
        validate(value);return value;
    }
    public static void validate(JSONObject value)throws Exception{
        if(!"laplace-lqt-checkpoint-v1".equals(value.getString("schema"))||
           !LQTBuild.KERNEL_SHA256.equals(value.getString("kernelSHA256")))
            throw new IllegalArgumentException("El aprendizaje pertenece a otra versión del motor");
        String asset=value.getString("asset");int g=value.getInt("granularity"),m=value.getInt("minutes");
        key(asset,g,m);
        String state=value.getString("checkpoint");
        if(state.length()>768*1024||!sha256(state).equals(value.getString("checkpointSHA256")))
            throw new IllegalArgumentException("El aprendizaje no coincide con su huella");
        int h=QuantumTemporalCompiler.horizon(asset,g,m);
        String prefix="LQT2 2 "+asset+" "+g+" "+h+" "+(MarketCatalog.isEquity(asset)?1:0)+" 1 ";
        if(!state.startsWith(prefix))throw new IllegalArgumentException("El aprendizaje no corresponde al activo o plazo");
    }
    public synchronized void write(String key,JSONObject value)throws Exception{
        validate(value);File destination=file(key);
        if(!key(value.getString("asset"),value.getInt("granularity"),value.getInt("minutes")).equals(key))
            throw new IllegalArgumentException("Contexto LQT contradictorio");
        byte[] bytes=value.toString().getBytes(StandardCharsets.UTF_8);
        if(bytes.length>1024*1024)throw new IllegalArgumentException("Checkpoint demasiado grande");
        File temporary=File.createTempFile("lqt-write-",".tmp",directory);
        try{
            try(FileOutputStream stream=new FileOutputStream(temporary)){
                stream.write(bytes);stream.getFD().sync();
            }
            Files.move(temporary.toPath(),destination.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
        }finally{Files.deleteIfExists(temporary.toPath());}
    }
}
