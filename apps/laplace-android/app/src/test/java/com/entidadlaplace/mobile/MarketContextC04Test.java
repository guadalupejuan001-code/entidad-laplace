package com.entidadlaplace.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.util.ArrayList;

public final class MarketContextC04Test {
    private String sample(String url){
        if(url.endsWith("ticker"))return "{\"price\":\"2000.25\",\"time\":\"2026-11-05T00:00:00Z\"}";
        if(url.endsWith("trades"))return "[]";
        return "{\"sequence\":123,\"bids\":[[\"2000\",\"1\",1]],\"asks\":[[\"2001\",\"2\",1]]}";
    }
    @Test public void fixedEndpointsPreserveSourceAndReceipt() throws Exception {
        ArrayList<String> urls=new ArrayList<>();long now=1793836801000L;
        JSONObject r=MarketContextC04.capture("ETH-USD",(url,max)->{urls.add(url);return sample(url);},()->now);
        assertEquals(3,urls.size());assertTrue(urls.stream().allMatch(u->u.startsWith("https://api.exchange.coinbase.com/products/ETH-USD/")));
        assertEquals("ETH-USD",r.getString("asset"));
        assertEquals("observed",r.getJSONObject("components").getJSONObject("ticker").getString("status"));
        assertEquals(64,r.getJSONObject("components").getJSONObject("book").getString("raw_sha256").length());
    }
    @Test public void secondaryFailureIsNotZeroDepth() throws Exception {
        JSONObject r=MarketContextC04.capture("SOL-USD",(url,max)->{
            if(url.contains("/book"))throw new java.io.IOException("offline");return sample(url);
        },()->1793836801000L);
        JSONObject b=r.getJSONObject("components").getJSONObject("book");
        assertEquals("unavailable",b.getString("status"));assertFalse(b.has("data"));
    }
    @Test public void unknownAssetsCannotCreateRequests() throws Exception {
        try{MarketContextC04.capture("../../accounts",(u,m)->{fail("No network request expected");return "";},()->0L);fail("Rejected asset expected");}
        catch(IllegalArgumentException expected){}
    }
}
