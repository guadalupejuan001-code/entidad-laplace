package com.entidadlaplace.mobile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Coinbase Exchange PUBLIC ticker + heartbeat protocol, read-only.
 * Rejects future timestamps, corrupt prices, unexpected symbols and
 * unconfirmed subscriptions. All times come from source, not local guesses.
 */
public final class LiveTickerProtocol {
    public static final String ENDPOINT="wss://ws-feed.exchange.coinbase.com";
    public static final Set<String> PRODUCTS = new HashSet<>(Arrays.asList(
        "BTC-USD","ETH-USD","SOL-USD"));
    private LiveTickerProtocol(){}

    public static String subscription() throws JSONException {
        JSONObject request=new JSONObject();
        request.put("type","subscribe");
        JSONArray products=new JSONArray();
        for(String id:new String[]{"BTC-USD","ETH-USD","SOL-USD"})products.put(id);
        request.put("product_ids",products);
        request.put("channels",new JSONArray().put("ticker").put("heartbeat"));
        return request.toString();
    }

    /** A positive ack must contain all 3 symbols in BOTH channels. */
    public static boolean subscribed(String text) throws JSONException {
        JSONObject data=new JSONObject(text);
        if(!"subscriptions".equals(data.optString("type")))return false;
        JSONArray channels=data.optJSONArray("channels");
        if(channels==null)return false;
        Set<String> ticker=new HashSet<>(),heartbeat=new HashSet<>();
        for(int i=0;i<channels.length();i++){
            JSONObject row=channels.optJSONObject(i);
            if(row==null)continue;
            String name=row.optString("name");
            Set<String> into="ticker".equals(name)?ticker:
                "heartbeat".equals(name)?heartbeat:null;
            if(into==null)continue;
            JSONArray ids=row.optJSONArray("product_ids");
            if(ids==null)continue;
            for(int j=0;j<ids.length();j++){
                String id=ids.optString(j);
                if(PRODUCTS.contains(id))into.add(id);
            }
        }
        return ticker.containsAll(PRODUCTS)&&heartbeat.containsAll(PRODUCTS);
    }

    /**
     * Converts a Coinbase ticker into a bounded, validated JS event.
     * Heartbeats are NOT prices. The clock of the source is retained.
     */
    public static JSONObject parseTicker(String payload,long receivedAt)
            throws JSONException {
        if(payload==null||payload.length()>16_384)
            throw new JSONException("Mensaje excesivo");
        JSONObject data=new JSONObject(payload);
        if(!"ticker".equals(data.optString("type")))
            throw new JSONException("No es ticker");
        String asset=data.optString("product_id","");
        if(!PRODUCTS.contains(asset))
            throw new JSONException("Activo de origen desconocido");
        final double price;
        try{price=Double.parseDouble(data.getString("price"));}
        catch(Exception e){throw new JSONException("Precio no numérico");}
        if(!Double.isFinite(price)||price<=0||price>1e10)
            throw new JSONException("Precio de fuente fuera de rango");
        String time=data.optString("time","");
        final long millis;
        try{millis=Instant.parse(time).toEpochMilli();}
        catch(Exception e){throw new JSONException("Marca temporal inválida");}
        if(millis>receivedAt+30_000L||receivedAt-millis>600_000L)
            throw new JSONException("Ticker demasiado antiguo o futuro");
        long sequence=data.optLong("sequence",-1L);
        if(sequence<0)throw new JSONException("Sin secuencia verificada");
        JSONObject result=new JSONObject();
        result.put("type","ticker");
        result.put("asset",asset);
        result.put("price",price);
        result.put("time",time);
        result.put("observedAt",millis);
        result.put("receivedAt",receivedAt);
        result.put("sequence",sequence);
        result.put("source","Coinbase Exchange · WebSocket ticker público");
        return result;
    }

    public static boolean isHeartbeat(String payload) {
        try {
            if(payload==null||payload.length()>16_384)return false;
            JSONObject data=new JSONObject(payload);
            return "heartbeat".equals(data.optString("type"))&&
                PRODUCTS.contains(data.optString("product_id",""));
        }catch(Exception e){return false;}
    }
}
