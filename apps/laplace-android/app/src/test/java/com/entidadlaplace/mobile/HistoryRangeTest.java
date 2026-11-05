package com.entidadlaplace.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONArray;
public final class HistoryRangeTest {
    private final long t=1793836800L;
    private JSONArray row(long time){return new JSONArray().put(time).put(99).put(101).put(100).put(100).put(2);}
    @Test public void oneBarHorizonNeedsOnlyTwoClosedBars() throws Exception {
        JSONArray rows=HistoryRange.fetch("BTC-USD",300,t,t+600,t+601,(asset,g,from,to)->{
            assertEquals(t,from);assertEquals(t+600,to);return new JSONArray().put(row(t+300)).put(row(t)).put(row(t+600));});
        assertEquals(2,rows.length());assertEquals(t,rows.getJSONArray(0).getLong(0));
    }
    @Test public void refusesUnknownAssetsFutureAndOversizedWindows() {
        for(int k=0;k<4;k++)try{
            HistoryRange.validate(k==0?"../../accounts":"BTC-USD",300,k==3?t+1:t,
                k==1?t+900:k==2?t+281*300:t+600,t+600);fail("Debe rechazar el rango");
        }catch(IllegalArgumentException expected){}
    }
    @Test public void absentAndContradictoryDataAreNotInvented() throws Exception {
        assertEquals(0,HistoryRange.fetch("ETH-USD",300,t,t+600,t+601,(a,g,f,e)->new JSONArray()).length());
        try{HistoryRange.fetch("ETH-USD",300,t,t+600,t+601,(a,g,f,e)->new JSONArray().put(row(t)).put(row(t).put(5,3)));fail("Contradicción esperada");}
        catch(java.io.IOException expected){}
    }
}
