package com.entidadlaplace.mobile;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

import java.time.Instant;

public final class LiveTickerProtocolTest {
    private static final long NOW=Instant.parse("2026-10-31T18:40:00Z").toEpochMilli();

    @Test public void subscribeUsesOnlyPublicTickerAndHeartbeat() throws Exception {
        JSONObject j=new JSONObject(LiveTickerProtocol.subscription());
        assertEquals("subscribe",j.getString("type"));
        assertEquals(3,j.getJSONArray("product_ids").length());
        assertEquals("ticker",j.getJSONArray("channels").getString(0));
        assertEquals("heartbeat",j.getJSONArray("channels").getString(1));
        assertEquals("wss://ws-feed.exchange.coinbase.com",LiveTickerProtocol.ENDPOINT);
    }

    @Test public void acknowledgeRequiresAllProductsAndBothChannels() throws Exception {
        String ticker="{\"name\":\"ticker\",\"product_ids\":[\"BTC-USD\",\"ETH-USD\",\"SOL-USD\"]}";
        String hb="{\"name\":\"heartbeat\",\"product_ids\":[\"BTC-USD\",\"ETH-USD\",\"SOL-USD\"]}";
        assertTrue(LiveTickerProtocol.subscribed("{\"type\":\"subscriptions\",\"channels\":["+ticker+","+hb+"]}"));
        assertFalse(LiveTickerProtocol.subscribed("{\"type\":\"subscriptions\",\"channels\":["+ticker+"]}"));
        assertFalse(LiveTickerProtocol.subscribed("{\"type\":\"subscriptions\",\"channels\":["+hb+"]}"));
    }

    private static String tick(String asset,String price,String time,long sequence){
        return "{\"type\":\"ticker\",\"product_id\":\""+asset+
            "\",\"price\":\""+price+"\",\"time\":\""+time+
            "\",\"sequence\":"+sequence+"}";
    }

    @Test public void priceHasExactSymbolTimestampAndSequence() throws Exception {
        JSONObject j=LiveTickerProtocol.parseTicker(
            tick("BTC-USD","69342.45","2026-10-31T18:39:59.321Z",371),NOW);
        assertEquals("BTC-USD",j.getString("asset"));
        assertEquals(69342.45,j.getDouble("price"),0.00001);
        assertEquals(371,j.getLong("sequence"));
        assertEquals("2026-10-31T18:39:59.321Z",j.getString("time"));
        assertEquals(NOW,j.getLong("receivedAt"));
        assertEquals("ticker",j.getString("type"));
    }

    @Test public void rejectFakePricesAndFutureOrAncientTimes() throws Exception {
        for(String price:new String[]{"NaN","-200","0","Infinity","100000000000.00"}){
            try{
                LiveTickerProtocol.parseTicker(tick("BTC-USD",price,
                    "2026-10-31T18:39:59Z",3),NOW);
                fail("Aceptó precio inválido: "+price);
            }catch(org.json.JSONException expected){}
        }
        for(String stamp:new String[]{"2026-10-31T18:41:00Z",
                "2026-10-31T18:00:00Z","invalid"}){
            try{
                LiveTickerProtocol.parseTicker(tick("BTC-USD","100",stamp,3),NOW);
                fail("Aceptó tiempo inválido: "+stamp);
            }catch(org.json.JSONException expected){}
        }
        try{
            LiveTickerProtocol.parseTicker(tick("DOGE-USD","1",
                "2026-10-31T18:39:59Z",3),NOW);
            fail("Aceptó activo no permitido");
        }catch(org.json.JSONException expected){}
    }

    @Test public void heartbeatIsNotPrice() throws Exception {
        String h="{\"type\":\"heartbeat\",\"product_id\":\"BTC-USD\",\"time\":\"2026-10-31T18:39:59Z\"}";
        assertTrue(LiveTickerProtocol.isHeartbeat(h));
        try{
            LiveTickerProtocol.parseTicker(h,NOW);
            fail("Heartbeat se convirtió en precio");
        }catch(org.json.JSONException expected){}
        assertFalse(LiveTickerProtocol.isHeartbeat(
            "{\"type\":\"heartbeat\",\"product_id\":\"FAKE-USD\"}"));
    }
}
