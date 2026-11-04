package com.entidadlaplace.mobile;
import org.json.JSONArray;
import java.time.Instant;
import java.time.ZoneId;
/** Serialization only. All model features, targets and learning are native. */
public final class QuantumTemporalCompiler {
    private QuantumTemporalCompiler(){}
    public static int horizon(String asset,int granularity,int minutes){
        if(!MarketCatalog.allowed(asset)||MarketCatalog.days(granularity,asset)<0)
            throw new IllegalArgumentException("Activo o resolución no permitidos");
        int[] allowed={5,15,30,60,120,240,300,480,720,1440,2880,4320,10080,20160,43200,129600};
        boolean found=false;for(int m:allowed)if(minutes==m)found=true;
        int expected=MarketCatalog.isCrypto(asset)?(minutes<=120?300:minutes<=4320?3600:86400):
            (minutes<=300?300:minutes<1440?3600:86400);
        if(!found||granularity!=expected||minutes*60L%granularity!=0)
            throw new IllegalArgumentException("Plazo y resolución incompatibles");
        return minutes*60/granularity;
    }
    public static String compile(String asset,int granularity,int minutes,JSONArray rows,
            long asOf,String template)throws Exception{
        int h=horizon(asset,granularity,minutes);
        if(rows==null||rows.length()<400||rows.length()>8640)
            throw new IllegalArgumentException("Se requieren entre 400 y 8640 velas cerradas");
        if(template==null||template.indexOf("# __CONFIG_AND_CLOSED_CANDLES__")<0)
            throw new IllegalArgumentException("Plantilla LQT no disponible");
        StringBuilder out=new StringBuilder();
        out.append("lqt.configure ").append(asset).append(' ').append(granularity).append(' ').append(h)
            .append(MarketCatalog.isEquity(asset)?" equity ":" crypto ").append(asOf).append(" quantum\n");
        long previous=0;
        for(int i=0;i<rows.length();i++){
            JSONArray row=rows.getJSONArray(i);
            if(row.length()!=6)throw new IllegalArgumentException("Vela OHLCV incompleta");
            double timestamp=row.getDouble(0);long t=(long)timestamp;
            if(timestamp!=t||t<=previous||t%granularity!=0||t+granularity>asOf)
                throw new IllegalArgumentException("Velas abiertas, duplicadas o sin ordenar");
            previous=t;out.append("lqt.candle ").append(t);
            for(int k=1;k<6;k++){
                double value=row.getDouble(k);
                if(!Double.isFinite(value))throw new IllegalArgumentException("Vela no finita");
                out.append(' ').append(Double.toString(value));
            }
            long session=Instant.ofEpochSecond(t).atZone(ZoneId.of("America/New_York")).toLocalDate().toEpochDay();
            out.append(' ').append(session).append('\n');
        }
        String source=template.replace("# __CONFIG_AND_CLOSED_CANDLES__",out.toString());
        if(source.length()>2*1024*1024)throw new IllegalArgumentException("Programa LQT demasiado grande");
        return source;
    }
}
