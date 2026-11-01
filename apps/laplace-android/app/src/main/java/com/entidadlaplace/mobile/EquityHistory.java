package com.entidadlaplace.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.TreeMap;

/** Fuente de investigación: endpoint público no oficial Yahoo Chart.
 * No es Robinhood, ni bolsa consolidada, ni asegura cotizaciones en vivo.
 * Nunca se sustituye un error HTTP por valores simulados.
 */
public final class EquityHistory {
    private EquityHistory(){}
    private static final int MAX_BYTES=3*1024*1024;
    private static final String HOST="https://query1.finance.yahoo.com/v8/finance/chart/";
    static String endpoint(String symbol,int granularity){
        if(!MarketCatalog.isEquity(symbol))throw new IllegalArgumentException("Ticker no autorizado");
        String interval=granularity==300?"5m":granularity==3600?"60m":
            granularity==86400?"1d":null;
        String range=granularity==300?"1mo":granularity==3600?"6mo":
            granularity==86400?"5y":null;
        if(interval==null)throw new IllegalArgumentException("Resolución no permitida");
        return HOST+symbol+"?interval="+interval+"&range="+range+
            "&includePrePost=false&events=div%2Csplits";
    }
    private static String download(String url) throws IOException {
        if(!url.startsWith(HOST))throw new IOException("Host de cotización prohibido");
        HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(9000);
        connection.setReadTimeout(16000);
        connection.setRequestProperty("Accept","application/json");
        connection.setRequestProperty("User-Agent","Laplace-Market-Research/3.7");
        try{
            final int code=connection.getResponseCode();
            if(code!=200)throw new IOException("Datos bursátiles Yahoo HTTP "+code+
                (code==429?" · cuota agotada":"")+
                " · no hay cotización verificada");
            ByteArrayOutputStream content=new ByteArrayOutputStream();
            try(InputStream input=connection.getInputStream()){
                byte[] block=new byte[8192];int n;
                while((n=input.read(block))!=-1){
                    if(content.size()+n>MAX_BYTES)throw new IOException(
                        "Respuesta bursátil excede tamaño permitido");
                    content.write(block,0,n);
                }
            }
            return content.toString(StandardCharsets.UTF_8.name());
        }finally{connection.disconnect();}
    }
    static JSONObject result(String json) throws JSONException,IOException {
        JSONObject chart=new JSONObject(json).optJSONObject("chart");
        if(chart==null)throw new IOException("Yahoo no entregó objeto chart");
        if(!chart.isNull("error"))throw new IOException("Yahoo: "+
            chart.optJSONObject("error").optString("description","fuente no disponible"));
        JSONArray results=chart.optJSONArray("result");
        if(results==null||results.length()<1||results.optJSONObject(0)==null)
            throw new IOException("Ticker no encontrado o mercado sin datos");
        return results.getJSONObject(0);
    }
    public static JSONArray history(String symbol,int granularity) throws Exception {
        return decodeBars(result(download(endpoint(symbol,granularity))),
            granularity,System.currentTimeMillis()/1000L);
    }
    static JSONArray decodeBars(JSONObject data,int step,long now) throws Exception {
        JSONArray stamps=data.optJSONArray("timestamp");
        JSONObject indicators=data.optJSONObject("indicators");
        JSONObject quote=indicators==null?null:indicators.optJSONArray("quote")==null?
            null:indicators.getJSONArray("quote").optJSONObject(0);
        if(stamps==null||quote==null||stamps.length()>15000)
            throw new IOException("Serie OHLCV no disponible");
        JSONArray lo=quote.optJSONArray("low"),hi=quote.optJSONArray("high"),
            op=quote.optJSONArray("open"),cl=quote.optJSONArray("close"),
            vol=quote.optJSONArray("volume");
        if(lo==null||hi==null||op==null||cl==null||vol==null||
            lo.length()!=stamps.length()||hi.length()!=stamps.length()||
            op.length()!=stamps.length()||cl.length()!=stamps.length()||
            vol.length()!=stamps.length())throw new IOException("Serie incompleta");
        TreeMap<Long,JSONArray> ordered=new TreeMap<>();
        for(int i=0;i<stamps.length();i++){
            if(stamps.isNull(i)||lo.isNull(i)||hi.isNull(i)||op.isNull(i)||
                cl.isNull(i)||vol.isNull(i))continue;
            final long raw=stamps.optLong(i,-1);
            final long time=step==3600?((raw+3599)/3600)*3600:
                (raw/step)*step;
            double low=lo.optDouble(i,Double.NaN),high=hi.optDouble(i,Double.NaN),
                open=op.optDouble(i,Double.NaN),close=cl.optDouble(i,Double.NaN),
                volume=vol.optDouble(i,Double.NaN);
            if(raw<=0||time<=0||time%step!=0||time+step>now||
               !Double.isFinite(low)||!Double.isFinite(high)||
               !Double.isFinite(open)||!Double.isFinite(close)||
               !Double.isFinite(volume)||low<=0||high<low||volume<0||
               open<low-1e-4||open>high+1e-4||
               close<low-1e-4||close>high+1e-4)continue;
            JSONArray row=new JSONArray();
            row.put(time);row.put(Math.min(low,open,close));
            row.put(Math.max(high,open,close));row.put(open);row.put(close);row.put(volume);
            JSONArray prior=ordered.putIfAbsent(time,row);
            if(prior!=null&&!prior.toString().equals(row.toString()))
                throw new IOException("Yahoo devolvió velas contradictorias");
        }
        if(ordered.size()<10)throw new IOException(
            "Sin 10 velas bursátiles cerradas válidas; mercado cerrado o proveedor limitado");
        JSONArray out=new JSONArray();
        for(JSONArray bar:ordered.values())out.put(bar);
        return out;
    }
    public static JSONObject quote(String symbol) throws Exception {
        if(!MarketCatalog.isEquity(symbol))throw new IOException("Ticker no permitido");
        JSONObject chart=result(download(HOST+symbol+"?interval=1d&range=5d"));
        JSONObject meta=chart.optJSONObject("meta");
        if(meta==null)throw new IOException("Yahoo: falta metadato temporal");
        double price=meta.optDouble("regularMarketPrice",Double.NaN);
        long last=meta.optLong("regularMarketTime",0);
        if(!Double.isFinite(price)||price<=0||last<=0||
            last>System.currentTimeMillis()/1000L+60L)
            throw new IOException("Precio bursátil indicativo sin fecha verificable");
        JSONObject out=new JSONObject();
        out.put("asset",symbol);out.put("price",price);
        out.put("time",new java.util.Date(last*1000L).toInstant().toString());
        out.put("receivedAt",System.currentTimeMillis());
        out.put("market","equity");
        out.put("isLive",false);
        out.put("indicative",true);
        out.put("source","Yahoo Finance · último precio indicativo; retraso o cierre posibles; NO Robinhood");
        return out;
    }
}
