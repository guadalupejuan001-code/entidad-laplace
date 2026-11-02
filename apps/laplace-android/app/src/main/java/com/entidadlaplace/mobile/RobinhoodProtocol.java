package com.entidadlaplace.mobile;
import org.json.JSONObject;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.UUID;
import net.i2p.crypto.eddsa.EdDSAEngine;
import net.i2p.crypto.eddsa.EdDSAPrivateKey;
import net.i2p.crypto.eddsa.spec.EdDSANamedCurveTable;
import net.i2p.crypto.eddsa.spec.EdDSAParameterSpec;
import net.i2p.crypto.eddsa.spec.EdDSAPrivateKeySpec;

/** Contrato oficial Robinhood Crypto v2. Firma exacta de los bytes enviados. */
public final class RobinhoodProtocol {
    public static final String BASE="https://trading.robinhood.com";
    public static String decimal(String value){
        if(value==null||!value.matches("[0-9]{1,18}(\\.[0-9]{1,18})?")||new BigDecimal(value).signum()<=0)
            throw new IllegalArgumentException("Cantidad o precio positivo en formato decimal requerido");
        return new BigDecimal(value).stripTrailingZeros().toPlainString();
    }
    public static String account(String value){
        if(value==null||!value.matches("[A-Za-z0-9_-]{1,80}"))throw new IllegalArgumentException("Selecciona una cuenta verificada");return value;
    }
    public static String uuid(String value){
        if(value==null||!UUID.fromString(value).toString().equals(value))throw new IllegalArgumentException("Identificador de orden inválido");return value;
    }
    public static JSONObject order(JSONObject input) throws Exception {
        String symbol=input.getString("symbol"),side=input.getString("side"),type=input.getString("type");
        if(!MarketCatalog.isCrypto(symbol))throw new IllegalArgumentException("La API oficial integrada admite criptomonedas, no acciones ni ETF");
        if(!side.equals("buy")&&!side.equals("sell"))throw new IllegalArgumentException("Lado de orden inválido");
        if(!type.equals("market")&&!type.equals("limit"))throw new IllegalArgumentException("Tipo de orden inválido");
        JSONObject config=new JSONObject().put("asset_quantity",decimal(input.getString("quantity")));
        if(type.equals("limit"))config.put("limit_price",decimal(input.getString("limit_price"))).put("time_in_force","gtc");
        return new JSONObject().put("client_order_id",uuid(input.getString("client_order_id")))
            .put("symbol",symbol).put("side",side).put("type",type).put(type+"_order_config",config);
    }
    public static String signature(byte[] seed,String apiKey,long timestamp,String path,String method,String body) throws Exception {
        if(seed==null||seed.length!=32)throw new IllegalArgumentException("Semilla Ed25519 inválida");
        if(!method.equals("GET")&&!method.equals("POST"))throw new IllegalArgumentException("Método no permitido");
        EdDSAParameterSpec spec=EdDSANamedCurveTable.getByName("Ed25519");
        EdDSAEngine engine=new EdDSAEngine(MessageDigest.getInstance("SHA-512"));
        engine.initSign(new EdDSAPrivateKey(new EdDSAPrivateKeySpec(seed,spec)));
        engine.update((apiKey+timestamp+path+method+(body==null?"":body)).getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(engine.sign());
    }
    public static String publicKey(byte[] seed){
        return Base64.getEncoder().encodeToString(new EdDSAPrivateKeySpec(seed,EdDSANamedCurveTable.getByName("Ed25519")).getA().toByteArray());
    }
    public static boolean allowedPath(String method,String path){
        if(path==null||path.length()>4096||path.contains("..")||path.contains("#")||path.contains("\\")||!path.matches("[A-Za-z0-9_/?=&%.,:-]+"))return false;
        if(method.equals("GET"))return path.matches("/api/v2/crypto/(trading/(accounts|trading_pairs|holdings|orders)|marketdata/(estimated_price|best_bid_ask))/(\\?[A-Za-z0-9_=&%.,:-]*)?");
        if(method.equals("POST"))return path.matches("/api/v2/crypto/trading/orders/(\\?account_number=[A-Za-z0-9_%.-]+)?")||path.matches("/api/v2/crypto/trading/orders/[a-f0-9-]{36}/cancel/");
        return false;
    }
}
