package com.entidadlaplace.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.function.LongSupplier;

/** Three fixed public read endpoints. No credentials, orders or arbitrary URL. */
public final class MarketContextC04 {
    private static final String ROOT="https://api.exchange.coinbase.com/products/";
    public interface Transport {String get(String url,int maxBytes) throws Exception;}
    public static boolean allowed(String asset){
        return "BTC-USD".equals(asset)||"ETH-USD".equals(asset)||"SOL-USD".equals(asset);
    }
    public static JSONObject capture(String asset) throws Exception {
        return capture(asset,MarketContextC04::read,System::currentTimeMillis);
    }
    static JSONObject capture(String asset,Transport transport,LongSupplier clock) throws Exception {
        if(!allowed(asset))throw new IllegalArgumentException("C04: activo no permitido");
        JSONObject components=new JSONObject();
        for(String name:new String[]{"ticker","book","trades"}){
            String url=ROOT+asset+"/"+("book".equals(name)?"book?level=2":name);
            JSONObject part=new JSONObject().put("source_url",url);
            try{
                int limit="book".equals(name)?2*1024*1024:"trades".equals(name)?256*1024:64*1024;
                String text=transport.get(url,limit);
                if(text.getBytes(StandardCharsets.UTF_8).length>limit)throw new IOException("Respuesta demasiado grande");
                Object data;
                if("trades".equals(name))data=new JSONArray(text);
                else if("book".equals(name)){
                    JSONObject book=new JSONObject(text),prefix=new JSONObject();
                    JSONObject counts=new JSONObject();
                    for(String side:new String[]{"bids","asks"}){
                        JSONArray all=book.getJSONArray(side),used=new JSONArray();
                        counts.put(side,all.length());
                        for(int k=0;k<Math.min(10,all.length());k++)used.put(all.get(k));
                        prefix.put(side,used);
                    }
                    prefix.put("sequence",book.opt("sequence"));part.put("source_level_counts",counts);data=prefix;
                }else data=new JSONObject(text);
                part.put("status","observed").put("received_at",Instant.ofEpochMilli(clock.getAsLong()).toString())
                    .put("raw_sha256",sha256(text)).put("data",data);
            }catch(Exception error){
                if("ticker".equals(name))throw error;
                part.put("status","unavailable").put("error","No se pudo obtener "+name);
            }
            components.put(name,part);
        }
        return new JSONObject().put("ok",true).put("schema","laplace-market-context-c04-v1")
            .put("asset",asset).put("captured_at",Instant.ofEpochMilli(clock.getAsLong()).toString())
            .put("components",components);
    }
    private static String sha256(String text) throws Exception {
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format("%02x",b&255));return out.toString();
    }
    private static String read(String url,int maxBytes) throws Exception {
        HttpURLConnection conn=(HttpURLConnection)new URL(url).openConnection();
        conn.setInstanceFollowRedirects(false);conn.setUseCaches(false);conn.setRequestMethod("GET");
        conn.setConnectTimeout(8000);conn.setReadTimeout(8000);
        conn.setRequestProperty("Accept","application/json");
        conn.setRequestProperty("User-Agent","EntidadLaplaceAndroid/C04 (public market research)");
        try{
            if(conn.getResponseCode()!=200)throw new IOException("Mercado C04: HTTP "+conn.getResponseCode());
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            try(InputStream input=conn.getInputStream()){
                byte[] buffer=new byte[8192];int count;
                while((count=input.read(buffer))!=-1){
                    if(out.size()+count>maxBytes)throw new IOException("Respuesta demasiado grande");out.write(buffer,0,count);
                }
            }
            return out.toString(StandardCharsets.UTF_8.name());
        }finally{conn.disconnect();}
    }
}
