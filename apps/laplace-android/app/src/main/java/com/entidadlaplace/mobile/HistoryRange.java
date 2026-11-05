package com.entidadlaplace.mobile;

import org.json.JSONArray;
import java.io.IOException;
import java.util.TreeMap;

/** Lectura acotada de los cierres de un pronóstico; no descarga entrenamiento. */
public final class HistoryRange {
    public interface Transport {JSONArray get(String asset,int step,long start,long end) throws Exception;}
    private HistoryRange(){}
    static void validate(String asset,int step,long start,long end,long now) {
        if(!MarketCatalog.isCrypto(asset)||MarketCatalog.days(step,asset)<0||start<=0||
           start%step!=0||end%step!=0||end<=start||end>now/step*step||
           end-start>280L*step)
            throw new IllegalArgumentException("Período de comprobación no permitido");
    }
    static JSONArray fetch(String asset,int step,long start,long end,long now,Transport transport) throws Exception {
        validate(asset,step,start,end,now);
        JSONArray source=transport.get(asset,step,start,end);
        if(source==null||source.length()>300)throw new IOException("Respuesta de cierres inválida");
        TreeMap<Long,JSONArray> ordered=new TreeMap<>();
        for(int i=0;i<source.length();i++){
            JSONArray r=source.optJSONArray(i);if(r==null||r.length()<6)continue;
            long t=r.optLong(0,-1);if(t<start||t>=end||t%step!=0||t+step>now)continue;
            JSONArray prior=ordered.putIfAbsent(t,r);
            if(prior!=null&&!prior.toString().equals(r.toString()))throw new IOException("Cierres contradictorios");
        }
        // Un período de 5 minutos necesita sólo dos velas; no exige diez.
        JSONArray result=new JSONArray();for(JSONArray row:ordered.values())result.put(row);
        return result;
    }
}
