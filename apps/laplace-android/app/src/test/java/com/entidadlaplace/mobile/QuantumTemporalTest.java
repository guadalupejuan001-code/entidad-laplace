package com.entidadlaplace.mobile;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import org.json.JSONObject;
import org.json.JSONArray;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class QuantumTemporalTest {
    @Rule public TemporaryFolder temp=new TemporaryFolder();
    @Test public void serializerRejectsWrongHorizonAndOpenCandles()throws Exception{
        assertEquals(3,QuantumTemporalCompiler.horizon("BTC-USD",300,15));
        assertEquals(1,QuantumTemporalCompiler.horizon("AAPL",86400,1440));
        try{QuantumTemporalCompiler.horizon("BTC-USD",3600,15);fail();}catch(IllegalArgumentException expected){}
        JSONArray rows=new JSONArray();long start=1800000000L;
        for(int i=0;i<400;i++)rows.put(new JSONArray().put(start+i*300L).put(90).put(110).put(100).put(101).put(10));
        String template="# __CONFIG_AND_CLOSED_CANDLES__\nlqt.run\n";
        String source=QuantumTemporalCompiler.compile("BTC-USD",300,15,rows,start+400*300L,template);
        assertTrue(source.startsWith("lqt.configure BTC-USD 300 3 crypto "));
        assertEquals(400,source.split("lqt.candle ",-1).length-1);
        try{QuantumTemporalCompiler.compile("BTC-USD",300,15,rows,start+400*300L-1,template);fail();}
        catch(IllegalArgumentException expected){}
    }
    @Test public void checkpointsAreContextSpecificAndWritesPreserveEarlierLearningOnFailure()throws Exception{
        QuantumTemporalStore store=new QuantumTemporalStore(temp.getRoot());
        // Opaque storage fixture, not a claim of a valid native trained model.
        // Full model structural validation is exercised by native tests/restore.
        String opaque="LQT2 2 BTC-USD 300 3 0 1 0\nopaque-storage-fixture\n";
        JSONObject value=new JSONObject().put("schema","laplace-lqt-checkpoint-v1").put("asset","BTC-USD")
            .put("granularity",300).put("minutes",15).put("kernelSHA256",LQTBuild.KERNEL_SHA256)
            .put("checkpoint",opaque).put("checkpointSHA256",QuantumTemporalStore.sha256(opaque));
        String key=QuantumTemporalStore.key("BTC-USD",300,15);store.write(key,value);
        assertEquals(opaque,store.read(key).getString("checkpoint"));
        assertNull(store.read(QuantumTemporalStore.key("ETH-USD",300,15)));
        JSONObject bad=new JSONObject(value.toString()).put("checkpoint",opaque+"tampered");
        try{store.write(key,bad);fail();}catch(IllegalArgumentException expected){}
        assertEquals(opaque,store.read(key).getString("checkpoint"));
        String file=new java.io.File(temp.getRoot(),"lqt1000-v2/"+key+".json").toString();
        Files.write(java.nio.file.Path.of(file),(value.toString()+"bad").getBytes(StandardCharsets.UTF_8));
        try{store.read(key);fail();}catch(Exception expected){}
    }
    @Test public void theOldModelDirectoryIsPreserved()throws Exception{
        java.io.File old=new java.io.File(temp.getRoot(),"lqt1000-v1");assertTrue(old.mkdir());
        java.io.File original=new java.io.File(old,"BTC-USD-300-3.json");
        byte[] previous="original v1 learning".getBytes(StandardCharsets.UTF_8);Files.write(original.toPath(),previous);
        QuantumTemporalStore store=new QuantumTemporalStore(temp.getRoot());
        assertNull(store.read(QuantumTemporalStore.key("BTC-USD",300,15)));
        assertArrayEquals(previous,Files.readAllBytes(original.toPath()));
    }
}
