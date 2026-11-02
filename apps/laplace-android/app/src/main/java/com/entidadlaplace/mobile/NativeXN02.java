package com.entidadlaplace.mobile;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
/** Same XI formulas as XN01, with u32 counters and a longer bounded input. */
public final class NativeXN02 {
    private NativeXN02(){}
    public static JSONObject analyze(String asset,JSONArray bars,String template)throws Exception {
        if(!"BTC-USD".equals(asset)||bars==null||bars.length()<64||bars.length()>1440)
            throw new IllegalArgumentException("XN02 exige BTC y entre 64 y 1440 velas");
        long closedAt=bars.getJSONArray(bars.length()-1).getLong(0)+300;
        long now=java.time.Instant.now().getEpochSecond();
        if(closedAt>now||now-closedAt>750)
            throw new IllegalArgumentException("Se requieren velas cerradas y actuales");
        String program=LaplaceXiWideCompiler.compile(bars,template);
        long start=SystemClock.elapsedRealtimeNanos();
        String output=NativeXN01.executeProgram(program);
        JSONObject result=LaplaceXiCompiler.parse(output,asset,
            SystemClock.elapsedRealtimeNanos()-start,new JSONObject()
                .put("runtime","mundo_x::QuantumRuntime").put("isolated",true).put("native_XI",true));
        int trained=result.getInt("training_rows"),support=result.getInt("support");
        if(trained<0||trained>bars.length()-7||support<0||support>trained)
            throw new IllegalStateException("Contadores XI incompatibles con las velas");
        result.put("schema","laplace-xn02-native-xi-v1");
        result.put("model","XN02 · XN01 con contadores uint32");
        result.put("input_rows",bars.length());
        result.put("input_sha256",NativeXN01.sha256(bars.toString()));
        result.put("program_sha256",NativeXN01.sha256(program));
        result.put("output_sha256",NativeXN01.sha256(output));
        result.put("raw_register_output",output);
        result.put("observed_close_at",java.time.Instant.ofEpochSecond(closedAt).toString());
        result.put("training_start_at",java.time.Instant.ofEpochSecond(bars.getJSONArray(0).getLong(0)).toString());
        result.put("internal_confidence_not_historical_accuracy",true);
        result.put("automatic_trading",false);
        return result;
    }
}
