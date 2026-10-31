package com.entidadlaplace.mobile;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
/** Executes the unmodified original XN01 .xi on original native XI/Ether.
 * Confidence is internal model probability, NOT observed market accuracy. */
public final class NativeXN01 {
    static { System.loadLibrary("laplace_xi"); }
    private NativeXN01(){}
    private static native String executeProgram(String source);
    static String sha256(String value)throws Exception {
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder out=new StringBuilder();
        for(byte b:digest)out.append(String.format(Locale.ROOT,"%02x",b&255));
        return out.toString();
    }
    public static JSONObject analyze(String asset,JSONArray bars,String template)throws Exception {
        if(!"BTC-USD".equals(asset))
            throw new IllegalArgumentException("XN01 original sólo BTC hasta validar otros mercados");
        if(bars==null||bars.length()<64)
            throw new IllegalArgumentException("XN01 necesita 64 velas de 5 minutos continuas");
        String program=LaplaceXiCompiler.compile(bars,template);
        long started=SystemClock.elapsedRealtimeNanos();
        String output=executeProgram(program);
        long elapsed=SystemClock.elapsedRealtimeNanos()-started;
        if(output==null||output.isEmpty())
            throw new IllegalStateException("XN01 no devolvió registros");
        JSONObject result=LaplaceXiCompiler.parse(output,asset,elapsed,
            new JSONObject().put("runtime","mundo_x::QuantumRuntime")
                .put("isolated",true).put("native_XI",true));
        result.put("program_sha256",sha256(program));
        result.put("output_sha256",sha256(output));
        result.put("raw_register_output",output);
        result.put("observed_close_at",java.time.Instant.ofEpochSecond(
             bars.getJSONArray(bars.length()-1).getLong(0)+300).toString());
        result.put("internal_confidence_not_historical_accuracy",true);
        result.put("automatic_trading",false);
        return result;
    }
}
