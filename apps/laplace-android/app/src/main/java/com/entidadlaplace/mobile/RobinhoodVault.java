package com.entidadlaplace.mobile;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Semilla privada cifrada con una clave no exportable de Android Keystore. */
final class RobinhoodVault {
    private static final String ALIAS="laplace_robinhood_crypto_v1";
    private final SharedPreferences preferences;
    RobinhoodVault(Context context){preferences=context.getSharedPreferences(ALIAS,Context.MODE_PRIVATE);}
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey();
        KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return gen.generateKey();
    }
    synchronized JSONObject read() throws Exception {
        String value=preferences.getString("encrypted",null);if(value==null)return new JSONObject();
        String[] parts=value.split("\\.");if(parts.length!=2)throw new IllegalArgumentException("Conexión cifrada no verificable");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[0])));
        return new JSONObject(new String(cipher.doFinal(Base64.getDecoder().decode(parts[1])),StandardCharsets.UTF_8));
    }
    private synchronized void write(JSONObject value) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        String data=Base64.getEncoder().encodeToString(cipher.getIV())+"."+
            Base64.getEncoder().encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)));
        if(!preferences.edit().putString("encrypted",data).commit())throw new IllegalStateException("No se pudo guardar la conexión cifrada");
    }
    synchronized JSONObject generate() throws Exception {
        JSONObject state=read();if(!state.has("seed")){byte[] seed=new byte[32];new SecureRandom().nextBytes(seed);
            state.put("seed",Base64.getEncoder().encodeToString(seed));write(state);}return status();
    }
    synchronized JSONObject configure(String apiKey) throws Exception {
        if(apiKey==null||!apiKey.matches("(?:rh-api-)?[a-fA-F0-9-]{36}"))throw new IllegalArgumentException("API key de Robinhood inválida");
        JSONObject state=read();if(!state.has("seed"))throw new IllegalStateException("Genera primero la clave pública de esta app");
        state.put("api_key",apiKey);write(state);return status();
    }
    synchronized JSONObject status() throws Exception {
        JSONObject state=read();return new JSONObject().put("configured",state.has("api_key"))
            .put("public_key",state.has("seed")?RobinhoodProtocol.publicKey(Base64.getDecoder().decode(state.getString("seed"))):"")
            .put("manual_orders",true).put("automatic_orders",false);
    }
    synchronized void disconnect() throws Exception {JSONObject state=read();state.remove("api_key");write(state);}
}
