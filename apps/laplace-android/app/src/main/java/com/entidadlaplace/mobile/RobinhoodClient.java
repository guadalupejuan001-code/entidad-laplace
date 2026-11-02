package com.entidadlaplace.mobile;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.RequestBody;
import okhttp3.MediaType;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

final class RobinhoodClient {
    static final class ApiException extends Exception {
        final int status;
        ApiException(int status,String message){super(message);this.status=status;}
    }
    private final RobinhoodVault vault;
    private final OkHttpClient client=new OkHttpClient.Builder().connectTimeout(12,TimeUnit.SECONDS)
        .readTimeout(25,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false)
        .retryOnConnectionFailure(false).build();
    RobinhoodClient(RobinhoodVault vault){this.vault=vault;}
    static String encoded(String value){try{return URLEncoder.encode(value,"UTF-8");}catch(java.io.UnsupportedEncodingException error){throw new IllegalStateException(error);}}
    JSONObject request(String method,String path,JSONObject body) throws Exception {
        if(!RobinhoodProtocol.allowedPath(method,path))throw new IllegalArgumentException("Endpoint fuera del contrato Robinhood Crypto");
        JSONObject credentials=vault.read();if(!credentials.has("api_key"))throw new IllegalStateException("Conecta tu API key de Robinhood Crypto");
        String apiKey=credentials.getString("api_key"),payload=body==null?"":body.toString();
        long timestamp=System.currentTimeMillis()/1000;
        String signature=RobinhoodProtocol.signature(Base64.getDecoder().decode(credentials.getString("seed")),apiKey,timestamp,path,method,payload);
        Request.Builder r=new Request.Builder().url(RobinhoodProtocol.BASE+path)
            .header("x-api-key",apiKey).header("x-timestamp",Long.toString(timestamp)).header("x-signature",signature)
            .header("Accept","application/json").header("User-Agent","LAPLACE-Android-Crypto");
        if(method.equals("POST"))r.post(RequestBody.create(payload,MediaType.parse("application/json; charset=utf-8")));else r.get();
        try(Response response=client.newCall(r.build()).execute()){
            if(response.body()==null)throw new IllegalArgumentException("Robinhood respondió sin contenido");
            ByteArrayOutputStream out=new ByteArrayOutputStream();try(InputStream in=response.body().byteStream()){
                byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>2*1024*1024)throw new IllegalArgumentException("Respuesta Robinhood demasiado grande");out.write(buffer,0,n);}}
            if(!response.isSuccessful())throw new ApiException(response.code(),"Robinhood HTTP "+response.code()+
                (response.code()==401?". Revisa la credencial y la hora del teléfono.":response.code()==403?". La cuenta o la clave no permiten esta operación.":response.code()==429?". Espera antes de reintentar.":". La operación fue rechazada; revisa sus parámetros."));
            String text=out.toString(StandardCharsets.UTF_8.name());return text.isEmpty()?new JSONObject():new JSONObject(text);
        }
    }
}
