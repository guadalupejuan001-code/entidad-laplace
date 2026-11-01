package com.entidadlaplace.mobile;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;

public class EquityHistoryTest {
    private static JSONObject chart(long start,int bars,int step,boolean bad) throws Exception {
        JSONArray stamps=new JSONArray(),low=new JSONArray(),high=new JSONArray(),
            open=new JSONArray(),close=new JSONArray(),volume=new JSONArray();
        for(int i=0;i<bars;i++){
            double value=100+i*.15;
            stamps.put(start+i*step);
            low.put(value-.2);high.put(value+.2);
            open.put(value);close.put(value+.05);
            volume.put(12000+i*10);
        }
        if(bad)close.put(2,-1);
        JSONObject q=new JSONObject();
        q.put("low",low);q.put("high",high);q.put("open",open);
        q.put("close",close);q.put("volume",volume);
        JSONObject indicators=new JSONObject().put("quote",new JSONArray().put(q));
        return new JSONObject().put("timestamp",stamps)
            .put("indicators",indicators)
            .put("meta",new JSONObject().put("regularMarketPrice",110.5)
                .put("regularMarketTime",start+step*(bars-1)));
    }
    @Test public void catalogoRestringidoYVentanas(){
        assertTrue(MarketCatalog.isCrypto("BTC-USD"));
        assertTrue(MarketCatalog.isCrypto("DOGE-USD"));
        assertTrue(MarketCatalog.isEquity("AAPL"));
        assertTrue(MarketCatalog.isEquity("SPY"));
        assertTrue(MarketCatalog.isEquity("HOOD"));
        assertFalse(MarketCatalog.allowed("ROBINHOOD-ACCOUNT"));
        assertFalse(MarketCatalog.allowed("https://otherhost.net"));
        assertEquals(30,MarketCatalog.days(300,"AAPL"));
        assertEquals(180,MarketCatalog.days(3600,"NVDA"));
        assertEquals(1825,MarketCatalog.days(86400,"SPY"));
        assertEquals(14,MarketCatalog.days(300,"BTC-USD"));
        assertEquals(-1,MarketCatalog.days(60,"AAPL"));
        assertTrue(EquityHistory.endpoint("AAPL",300).contains("interval=5m"));
        assertTrue(EquityHistory.endpoint("SPY",86400).contains("range=5y"));
        try{EquityHistory.endpoint("NOT_LISTED",300);fail("Unlisted");}
        catch(IllegalArgumentException expected){}
    }
    @Test public void filtraVelasAbiertasNulasYMalformadas()throws Exception {
        long start=1700000100L; // Multiplo exacto de 300 s
        start=start-start%300;
        JSONObject c=chart(start,15,300,false);
        JSONArray rows=EquityHistory.decodeBars(c,300,start+13*300+1);
        assertEquals(13,rows.length());
        assertEquals(start,rows.getJSONArray(0).getLong(0));
        assertTrue(rows.getJSONArray(0).getDouble(1)>0);
        c.getJSONObject("indicators").getJSONArray("quote").getJSONObject(0)
          .getJSONArray("close").put(1,JSONObject.NULL);
        rows=EquityHistory.decodeBars(c,300,start+16*300);
        assertEquals(14,rows.length());
        assertTrue(rows.getJSONArray(0).getLong(0)<rows.getJSONArray(13).getLong(0));
    }
    @Test public void nuncaRellenaVelasAusentesNiAceptaPreciosNegativos()throws Exception{
        long start=1700000100L;start-=start%300;
        JSONObject c=chart(start,20,300,true);
        JSONArray rows=EquityHistory.decodeBars(c,300,start+25*300);
        assertEquals(19,rows.length());
        assertEquals(start+3*300,rows.getJSONArray(2).getLong(0));
    }
    @Test public void noAceptarErroresDelProveedorComoPrecio()throws Exception {
        assertThrows(IOException.class,()->EquityHistory.result(
            "{\"chart\":{\"result\":null,\"error\":{\"description\":\"HTTP 429\"}}}"));
        assertThrows(IOException.class,()->EquityHistory.result(
            "{\"chart\":{\"result\":[],\"error\":null}}"));
    }
}
