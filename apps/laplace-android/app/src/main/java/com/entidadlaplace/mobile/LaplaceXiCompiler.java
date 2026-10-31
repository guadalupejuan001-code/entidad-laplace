package com.entidadlaplace.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;

/** Serializa OHLCV observado hacia el programa XI XN01.
 * No calcula mascara, probabilidad ni direccion: eso ocurre dentro de XI/Ether.
 */
public final class LaplaceXiCompiler {
    private static final long CLOSE_BASE=1_000_000L,VOLUME_BASE=2_000_000L,
        STATE_VALID_BASE=2_500_000L,LABEL_VALID_BASE=2_600_000L;
    private static final int MIN_ROWS=64,MAX_ROWS=240;
    private LaplaceXiCompiler(){}

    private static void need(boolean ok,String message){if(!ok)throw new IllegalArgumentException(message);}
    private static long u32(double value,double scale,String name){
        need(Double.isFinite(value)&&value>=0,name+" inválido");
        long v=Math.round(value*scale);
        need(v>=0&&v<=0xffff_ffffL,name+" fuera de uint32");
        return v;
    }
    private static void store32(StringBuilder out,long address,long value){
        for(int i=0;i<4;i++)out.append("store8 ").append(address+i).append(' ')
            .append((value>>(i*8))&255L).append('\n');
    }
    private static boolean stateValid(long[] time,int i){
        if(i<6)return false;
        for(int j=i-5;j<=i;j++)if(time[j]-time[j-1]!=300)return false;
        return true;
    }

    public static String compile(JSONArray input,String template)throws org.json.JSONException{
        need(input!=null&&template!=null&&template.startsWith("#!reverse-pc-machine-v1\n"),
            "Plantilla XI incompatible");
        need(template.contains("# __INPUT_BYTES__"),"Plantilla XI sin punto de entrada");
        int available=input.length(),n=Math.min(MAX_ROWS,available);
        need(n>=MIN_ROWS,"Se requieren al menos "+MIN_ROWS+" velas cerradas");
        int offset=available-n;
        long[] time=new long[n],close=new long[n],volume=new long[n];
        for(int i=0;i<n;i++){
            JSONArray row=input.getJSONArray(offset+i);
            need(row.length()>=6,"Vela OHLCV incompleta");
            long t=row.getLong(0);
            double low=row.getDouble(1),high=row.getDouble(2),open=row.getDouble(3),
                c=row.getDouble(4),v=row.getDouble(5);
            need(t>=0&&t%300==0&&Double.isFinite(low)&&Double.isFinite(high)&&
                Double.isFinite(open)&&Double.isFinite(c)&&Double.isFinite(v)&&
                low>0&&high>=low&&open>=low&&open<=high&&c>=low&&c<=high&&v>=0,
                "Vela OHLCV inválida");
            if(i>0)need(t>time[i-1],"Velas fuera de orden o duplicadas");
            time[i]=t;close[i]=u32(c,100.0,"Precio");volume[i]=u32(v,1.0,"Volumen");
        }
        need(stateValid(time,n-1),"El estado actual cruza una pausa de mercado");
        StringBuilder stores=new StringBuilder(64_000);
        stores.append("set r15 ").append(n).append('\n');
        for(int i=0;i<n;i++){
            store32(stores,CLOSE_BASE+i*4L,close[i]);
            store32(stores,VOLUME_BASE+i*4L,volume[i]);
            stores.append("store8 ").append(STATE_VALID_BASE+i).append(' ')
                .append(stateValid(time,i)?1:0).append('\n');
            boolean label=stateValid(time,i)&&i+1<n&&time[i+1]-time[i]==300;
            stores.append("store8 ").append(LABEL_VALID_BASE+i).append(' ')
                .append(label?1:0).append('\n');
        }
        String program=template.replace("# __INPUT_BYTES__",stores.toString().trim());
        need(program.getBytes(StandardCharsets.UTF_8).length<=256*1024,
            "Programa XN01 supera 256 KiB");
        return program;
    }

    public static JSONObject parse(String output,String asset,long elapsedNs,JSONObject core)throws Exception{
        int[] values=new int[7];boolean[] found=new boolean[7];
        for(String line:output.split("\\n")){
            if(line.isEmpty()||line.charAt(0)!='{')continue;
            JSONObject row=new JSONObject(line);
            if(!"register".equals(row.optString("type")))continue;
            String register=row.optString("register");
            int index=switch(register){
                case "r0"->0; case "r8"->1; case "r9"->2; case "r3"->3;
                case "r7"->4; case "r6"->5; case "r10"->6; default->-1;};
            if(index>=0){values[index]=row.getInt("value");found[index]=true;}
        }
        for(boolean ok:found)need(ok,"Salida XI XN01 incompleta");
        need(values[0]>=0&&values[0]<16,"Máscara XI fuera de rango");
        need(values[1]>=0&&values[1]<=10000&&values[2]>=0&&values[2]<=1,
            "Probabilidad XI fuera de rango");
        return new JSONObject()
            .put("schema","laplace-xn01-native-xi-v1")
            .put("asset",asset)
            .put("backend","XI/Ether · NativeRuntime")
            .put("mask",values[0])
            .put("probability_up_bps",values[1])
            .put("probability_up",values[1]/10000.0)
            .put("direction",values[2]==1?"subida":"bajada")
            .put("support",values[3])
            .put("prior_bps",values[4])
            .put("prior",values[4]/10000.0)
            .put("training_rows",values[5])
            .put("confidence_bps",values[6])
            .put("confidence",values[6]/10000.0)
            .put("elapsed_ns",elapsedNs)
            .put("core",core);
    }
}
