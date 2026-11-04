package com.entidadlaplace.mobile;
import org.junit.Test;
import org.json.JSONObject;
import org.json.JSONArray;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.Assert.*;

/** The real JNI library, original Ether and closed archived candles. */
public class QuantumTemporalNativeTest {
    @Test public void nativeLibraryTrainsRestoresAndContinuesAll1000Rotations()throws Exception{
        Path root=Path.of(System.getProperty("laplace.repo"));
        JSONObject source=new JSONObject(Files.readString(root.resolve("evidencia/entrenamiento-x002-20261030/velas.json")));
        JSONArray all=source.getJSONArray("rows"),rows=new JSONArray(),later=new JSONArray();
        for(int i=all.length()-4032;i<all.length();i++){
            later.put(all.getJSONArray(i));if(i<all.length()-12)rows.put(all.getJSONArray(i));
        }
        String template=Files.readString(root.resolve("apps/laplace-android/app/src/main/assets/lqt1000-native.xi"));
        long cutoff=rows.getJSONArray(rows.length()-1).getLong(0)+300;
        String program=QuantumTemporalCompiler.compile("BTC-USD",300,15,rows,cutoff,template);
        JSONObject trained=new JSONObject(NativeQuantumTemporal.executeProgram(program,""));
        assertEquals(1000,trained.getInt("updatedRotations"));assertEquals(1,trained.getInt("components"));
        String checkpoint=trained.getString("checkpoint");
        NativeQuantumTemporal.validateCheckpoint(checkpoint,"BTC-USD",300,15,false,cutoff);
        JSONObject restored=new JSONObject(NativeQuantumTemporal.executeProgram(program,checkpoint));
        assertEquals(checkpoint,restored.getString("checkpoint"));
        assertEquals(trained.getJSONArray("outputs").toString(),restored.getJSONArray("outputs").toString());
        long next=later.getJSONArray(later.length()-1).getLong(0)+300;
        String nextProgram=QuantumTemporalCompiler.compile("BTC-USD",300,15,later,next,template);
        JSONObject updated=new JSONObject(NativeQuantumTemporal.executeProgram(nextProgram,checkpoint));
        assertEquals(4,updated.getInt("onlineUpdates"));assertEquals(trained.getInt("updates")+4,updated.getInt("updates"));
        assertNotEquals(checkpoint,updated.getString("checkpoint"));
        JSONObject repeated=new JSONObject(NativeQuantumTemporal.executeProgram(nextProgram,updated.getString("checkpoint")));
        assertEquals(0,repeated.getInt("onlineUpdates"));assertEquals(updated.getString("checkpoint"),repeated.getString("checkpoint"));
        try{NativeQuantumTemporal.validateCheckpoint(checkpoint,"ETH-USD",300,15,false,cutoff);fail();}
        catch(IllegalStateException expected){}
        try{NativeQuantumTemporal.validateCheckpoint(checkpoint+"invalid","BTC-USD",300,15,false,cutoff);fail();}
        catch(IllegalStateException expected){}
    }
}
