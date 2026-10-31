package com.reversepc.os;

import org.json.JSONArray;
import org.json.JSONObject;
import java.math.BigInteger;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

/** U002: valida y serializa 369 estados globales hacia XI/Inverse Ether Memory.
 * El host no calcula una prediccion. Solo preserva identidad, valor y tiempos;
 * XI ejecuta mem_store + mem_materialize y el resultado se compara byte a byte.
 */
public final class LaplaceGlobalCompiler {
    private static final BigInteger BASE=new BigInteger("970000000000000000000000000000");
    private static final int SIGNALS=369,RECORD_BYTES=32,HEADER_BYTES=16;
    private static final int MAX_PROGRAM_BYTES=1024*1024;
    private LaplaceGlobalCompiler(){}

    public static final class Compiled {
        public final String program,baseAddress,snapshotSha256,captureSha256,encodedSha256;
        public final byte[] expected;
        public final int records,nonzero;
        Compiled(String program,byte[] expected,int nonzero,String snapshotSha256,
                 String captureSha256,String encodedSha256){
            this.program=program;this.expected=expected;this.nonzero=nonzero;
            this.records=SIGNALS;this.baseAddress=BASE.toString();
            this.snapshotSha256=snapshotSha256;this.captureSha256=captureSha256;
            this.encodedSha256=encodedSha256;
        }
    }

    private static void need(boolean ok,String message){
        if(!ok)throw new IllegalArgumentException(message);
    }
    private static String required(JSONObject o,String name)throws Exception{
        String value=o.getString(name);
        need(value!=null&&!value.isEmpty(),name+" vacío");
        return value;
    }
    private static void identifier(String value,String name,int max){
        need(value.length()<=max&&value.matches("[A-Za-z0-9_.:/-]+"),name+" inválido");
    }
    private static byte[] digest(byte[] data)throws Exception{
        return MessageDigest.getInstance("SHA-256").digest(data);
    }
    private static byte[] digest(String text)throws Exception{
        return digest(text.getBytes(StandardCharsets.UTF_8));
    }
    private static String hex(byte[] data){
        StringBuilder out=new StringBuilder(data.length*2);
        for(byte x:data)out.append(String.format(java.util.Locale.ROOT,"%02x",x&255));
        return out.toString();
    }
    private static byte[] hexBytes(String text){
        need(text!=null&&text.matches("[a-f0-9]+")&&text.length()%2==0,"hex inválido");
        byte[] out=new byte[text.length()/2];
        for(int i=0;i<out.length;i++)out[i]=(byte)Integer.parseInt(text.substring(i*2,i*2+2),16);
        return out;
    }
    private static void putLongLE(byte[] out,int at,long value){
        ByteBuffer.wrap(out,at,8).order(ByteOrder.LITTLE_ENDIAN).putLong(value);
    }
    private static void putDoubleLE(byte[] out,int at,double value){
        ByteBuffer.wrap(out,at,8).order(ByteOrder.LITTLE_ENDIAN).putDouble(value);
    }
    private static void putIntLE(byte[] out,int at,int value){
        ByteBuffer.wrap(out,at,4).order(ByteOrder.LITTLE_ENDIAN).putInt(value);
    }

    public static Compiled compile(JSONObject capture,String template)throws Exception{
        need(capture!=null&&"laplace-universo-global-u002-v1".equals(capture.optString("schema")),
            "Captura U002 incompatible");
        need(template!=null&&template.startsWith("#!reverse-pc-machine-v1\n")&&
            template.contains("# __GLOBAL_BYTES__")&&template.contains("# __GLOBAL_MATERIALIZE__"),
            "Plantilla U002/XI incompatible");
        need(!capture.optBoolean("prediction_inputs_enabled",true)&&
             !capture.optBoolean("automatic_trading",true),
             "U002 no debe activar predicción ni trading automáticamente");
        String captureHash=required(capture,"capture_sha256");
        need(captureHash.matches("[a-f0-9]{64}"),"Sello U002 inválido");
        Instant captured=Instant.parse(required(capture,"at"));

        JSONObject coverage=capture.getJSONObject("coverage");
        need(coverage.getInt("known_signals")==SIGNALS&&coverage.getInt("failed_sources")==0,
            "La captura global no contiene las 369 señales completas");

        JSONObject snapshot=capture.getJSONObject("universal_state");
        need(snapshot.getInt("known_states")==SIGNALS&&!snapshot.optBoolean("complete_universe_observed",true),
            "Snapshot global U002 incompatible");
        String snapshotHash=required(snapshot,"snapshot_sha256");
        need(snapshotHash.matches("[a-f0-9]{64}"),"Hash del snapshot U002 inválido");
        JSONArray states=snapshot.getJSONArray("states");
        need(states.length()==SIGNALS,"U002 requiere exactamente 369 estados");

        byte[] bytes=new byte[HEADER_BYTES+SIGNALS*RECORD_BYTES];
        byte[] magic="LPG2".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(magic,0,bytes,0,magic.length);
        putIntLE(bytes,4,SIGNALS);
        byte[] snapPrefix=hexBytes(snapshotHash.substring(0,16));
        System.arraycopy(snapPrefix,0,bytes,8,8);

        for(int i=0;i<SIGNALS;i++){
            JSONObject row=states.getJSONObject(i);
            String id=required(row,"id"),domain=required(row,"domain"),
                variable=required(row,"variable"),unit=required(row,"unit"),
                source=required(row,"source_url");
            identifier(id,"id",120);identifier(domain,"domain",60);
            identifier(variable,"variable",120);identifier(unit,"unit",32);
            URI uri=new URI(source);
            need("https".equalsIgnoreCase(uri.getScheme())&&uri.getUserInfo()==null,
                "Fuente U002 no HTTPS");
            double value=row.getDouble("value");
            need(Double.isFinite(value)&&Math.abs(value)<=1e30,"Valor U002 fuera de rango");
            Instant observed=Instant.parse(required(row,"observed_at"));
            Instant known=Instant.parse(required(row,"known_at"));
            need(!known.isBefore(observed)&&!known.isAfter(captured),
                "Tiempos U002 incoherentes");
            int at=HEADER_BYTES+i*RECORD_BYTES;
            byte[] key=digest(domain+"|"+variable+"|"+unit+"|"+id);
            System.arraycopy(key,0,bytes,at,8);
            putDoubleLE(bytes,at+8,value);
            putLongLE(bytes,at+16,observed.toEpochMilli());
            putLongLE(bytes,at+24,known.toEpochMilli());
        }

        StringBuilder stores=new StringBuilder(700_000);
        stores.append("mem_reset 0\n");
        int nonzero=0;
        for(int i=0;i<bytes.length;i++)if(bytes[i]!=0){
            stores.append("mem_store ").append(BASE.add(BigInteger.valueOf(i))).append(' ')
                .append(bytes[i]&255).append('\n');
            nonzero++;
        }
        String materialize="mem_materialize "+BASE+" "+bytes.length;
        String program=template.replace("# __GLOBAL_BYTES__",stores.toString().trim())
            .replace("# __GLOBAL_MATERIALIZE__",materialize);
        need(program.getBytes(StandardCharsets.UTF_8).length<=MAX_PROGRAM_BYTES,
            "Programa U002/XI supera 1 MiB");
        return new Compiled(program,bytes,nonzero,snapshotHash,captureHash,hex(digest(bytes)));
    }

    public static JSONObject parse(String output,Compiled compiled,long elapsedNs,JSONObject core)throws Exception{
        JSONObject materialized=null,memory=null;
        for(String line:output.split("\n")){
            if(line.isEmpty()||line.charAt(0)!='{')continue;
            JSONObject row=new JSONObject(line);
            if("memory_materialization".equals(row.optString("type")))materialized=row;
            if("memory_stats".equals(row.optString("type")))memory=row;
        }
        need(materialized!=null&&memory!=null,"Salida U002/XI incompleta");
        need(compiled.baseAddress.equals(materialized.getString("address"))&&
            materialized.getInt("bytes")==compiled.expected.length,
            "Materialización U002/XI con dirección o tamaño incorrectos");
        String actualHex=materialized.getString("hex");
        need(actualHex.equals(hex(compiled.expected)),"XI/Ether alteró el snapshot mundial");
        need("inverse-ether-memory".equals(memory.getString("model"))&&
            memory.getInt("quantum_bindings")==0&&memory.getInt("overrides")==compiled.nonzero,
            "Metadata Inverse Ether Memory U002 inesperada");
        need(core.getInt("active_qubits")==0,
            "Estados mundiales clásicos no deben crear qubits implícitos");

        return new JSONObject()
            .put("schema","laplace-u002-native-xi-v1")
            .put("backend","XI/Ether · NativeRuntime")
            .put("records",compiled.records)
            .put("materialized_bytes",compiled.expected.length)
            .put("inverse_memory_overrides",compiled.nonzero)
            .put("active_qubits",0)
            .put("exact_roundtrip",true)
            .put("snapshot_sha256",compiled.snapshotSha256)
            .put("capture_sha256",compiled.captureSha256)
            .put("encoded_sha256",compiled.encodedSha256)
            .put("elapsed_ns",elapsedNs)
            .put("prediction_generated",false)
            .put("isolated",true);
    }
}
