package com.entidadlaplace.mobile;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
public class LaplaceXiWideCompilerTest {
    private static final String TEMPLATE="#!reverse-pc-machine-v1\n# __INPUT_BYTES__\nhalt\n";
    private JSONArray bars(int n)throws Exception{
        JSONArray out=new JSONArray();
        for(int i=0;i<n;i++)out.put(new JSONArray().put(1800000000L+i*300L)
            .put(9000+i).put(11000+i).put(10000+i).put(10000+i).put(10));
        return out;
    }
    @Test public void serializesFiveDaysInsteadOfSilentlyKeeping240()throws Exception{
        String source=LaplaceXiWideCompiler.compile(bars(1440),TEMPLATE);
        assertTrue(source.contains("set r15 1440\n"));
        assertTrue(source.contains("store8 1005756 "));
        assertTrue(source.contains("store8 2601439 0"));
        assertTrue(source.contains("store8 2601438 1"));
        assertTrue(source.getBytes(java.nio.charset.StandardCharsets.UTF_8).length<512*1024);
    }
    @Test public void first240HaveExactlyOriginalTransport()throws Exception{
        JSONArray input=bars(240);
        assertEquals(LaplaceXiCompiler.compile(input,TEMPLATE),LaplaceXiWideCompiler.compile(input,TEMPLATE));
    }
    @Test public void pausesExcludeUnobservableTrainingLabels()throws Exception{
        JSONArray input=bars(864);
        for(int i=400;i<input.length();i++)input.getJSONArray(i).put(0,1800000000L+(i+1)*300L);
        String source=LaplaceXiWideCompiler.compile(input,TEMPLATE);
        assertTrue(source.contains("store8 2600399 0"));
        assertTrue(source.contains("store8 2500400 0"));
        assertTrue(source.contains("store8 2500405 0"));
        assertTrue(source.contains("store8 2500406 1"));
    }
    @Test public void refusesMalformedInput()throws Exception{
        assertThrows(IllegalArgumentException.class,()->LaplaceXiWideCompiler.compile(bars(63),TEMPLATE));
        JSONArray duplicated=bars(64);duplicated.getJSONArray(20).put(0,duplicated.getJSONArray(19).getLong(0));
        assertThrows(IllegalArgumentException.class,()->LaplaceXiWideCompiler.compile(duplicated,TEMPLATE));
        JSONArray overflow=bars(64);overflow.getJSONArray(0).put(5,4294967296.0);
        assertThrows(IllegalArgumentException.class,()->LaplaceXiWideCompiler.compile(overflow,TEMPLATE));
    }
    @Test public void parserDoesNotNarrowCountersBackToBytes()throws Exception{
        String[] registers={"r0","r8","r9","r3","r7","r6","r10"};
        int[] values={3,6000,1,1433,5500,1433,6000};StringBuilder output=new StringBuilder();
        for(int i=0;i<registers.length;i++)output.append(new JSONObject().put("type","register")
            .put("register",registers[i]).put("value",values[i])).append('\n');
        JSONObject result=LaplaceXiCompiler.parse(output.toString(),"BTC-USD",1,new JSONObject());
        assertEquals(1433,result.getInt("support"));assertEquals(1433,result.getInt("training_rows"));
    }
}
