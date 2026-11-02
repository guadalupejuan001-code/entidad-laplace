package com.entidadlaplace.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.zip.GZIPInputStream;

/** Archivo público propio, fijado por commit. No acepta URLs ni credenciales externas. */
public final class EF004Archive {
    private static final String REPO="guadalupejuan001-code/entidad-laplace";
    public interface Progress {void accept(int done,int total);}
    private static byte[] read(InputStream in,int limit) throws Exception {
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
        while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new IllegalArgumentException("Archivo supera el tamaño de transporte permitido");out.write(buffer,0,n);}
        return out.toByteArray();
    }
    private static byte[] get(String address,int limit) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(address).openConnection();
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(12000);c.setReadTimeout(25000);
        c.setRequestProperty("User-Agent","LAPLACE-Android-EF004");c.setRequestProperty("Accept-Encoding","identity");
        try{int status=c.getResponseCode();if(status!=200)throw new IllegalArgumentException("Archivo público HTTP "+status);
            try(InputStream in=c.getInputStream()){return read(in,limit);}
        }finally{c.disconnect();}
    }
    public static String digest(byte[] bytes) throws Exception {
        StringBuilder s=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))s.append(String.format("%02x",b&255));return s.toString();
    }
    public static JSONObject download(Progress progress) throws Exception {
        JSONObject branch=new JSONObject(new String(get("https://api.github.com/repos/"+REPO+"/branches/laplace-archivo",2*1024*1024),StandardCharsets.UTF_8));
        String commit=branch.getJSONObject("commit").getString("sha");
        if(!commit.matches("[a-f0-9]{40}"))throw new IllegalArgumentException("Commit del archivo inválido");
        JSONObject tree=new JSONObject(new String(get("https://api.github.com/repos/"+REPO+"/git/trees/"+commit+"?recursive=1",16*1024*1024),StandardCharsets.UTF_8));
        if(tree.optBoolean("truncated"))throw new IllegalArgumentException("Índice incompleto; se conserva la copia anterior");
        ArrayList<String> paths=new ArrayList<>();JSONArray items=tree.getJSONArray("tree");
        for(int i=0;i<items.length();i++){
            String p=items.getJSONObject(i).optString("path");
            if(p.matches("capturas/[0-9]{4}/[0-9]{2}/[0-9]{2}/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}\\.manifest\\.json"))paths.add(p);
        }
        Collections.sort(paths);if(paths.isEmpty())throw new IllegalArgumentException("Sin capturas EF002 publicadas");
        JSONArray rawCaptures=new JSONArray();int done=0;
        for(String path:paths){
            String base="https://raw.githubusercontent.com/"+REPO+"/"+commit+"/";
            JSONObject manifest=new JSONObject(new String(get(base+path,1024*1024),StandardCharsets.UTF_8));
            byte[] packed=get(base+path.replace(".manifest.json",".json.gz"),16*1024*1024);
            if(!digest(packed).equals(manifest.getString("archive_sha256")))throw new IllegalArgumentException("SHA del archivo comprimido no coincide");
            byte[] raw;try(GZIPInputStream zip=new GZIPInputStream(new ByteArrayInputStream(packed))){raw=read(zip,64*1024*1024);}
            if(raw.length!=manifest.getInt("original_bytes"))throw new IllegalArgumentException("Longitud de captura alterada");
            String text=new String(raw,StandardCharsets.UTF_8);JSONObject capture=new JSONObject(text);
            if(!capture.getString("capture_sha256").equals(manifest.getString("capture_sha256"))||
               !capture.getJSONObject("universal_state").getString("snapshot_sha256").equals(manifest.getString("snapshot_sha256")))
                throw new IllegalArgumentException("Manifiesto no corresponde a captura");
            // Los strings conservan el orden original de U001 para su hash JSON.
            rawCaptures.put(text);progress.accept(++done,paths.size());
        }
        return new JSONObject().put("ok",true).put("commit",commit).put("captures_raw",rawCaptures);
    }
}
