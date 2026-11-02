package com.entidadlaplace.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.util.Base64;
public final class RobinhoodProtocolTest {
    // Vector público de las instrucciones oficiales. No es una credencial de usuario.
    private static final byte[] SEED=Base64.getDecoder().decode("xQnTJVeQLmw1/Mg2YimEViSpw/SdJcgNXZ5kQkAXNPU=");
    @Test public void publicKeyMatchesOfficialVector(){
        assertEquals("jPItx4TLjcnSUnmnXQQyAKL4eJj3+oWNNMmmm2vATqk=",RobinhoodProtocol.publicKey(SEED));
    }
    // Firma recalculada con cryptography/Ed25519 para ESTE cuerpo literal, sin reformatearlo.
    @Test public void signatureMatchesByteExactReference() throws Exception {
        String body="{\"client_order_id\":\"131de903-5a9c-4260-abc1-28d562a5dcf0\",\"side\":\"buy\",\"type\":\"market\",\"symbol\":\"BTC-USD\",\"market_order_config\":{\"asset_quantity\":\"0.1\"}}";
        String signature=RobinhoodProtocol.signature(SEED,"rh-api-6148effc-c0b1-486c-8940-a1d099456be6",1698708981L,"/api/v1/crypto/trading/orders/","POST",body);
        assertEquals("6tIj8o6p+4w+ZnaxVanHtxjhC6s5z4lTI+8lNRjJOZp0dVDlco2NR6obVwBiECP8eoHtfcbsGfTu1rESBHOzCA==",signature);
    }
    @Test public void decimalQuantityIsPreservedWithoutBinaryRounding() throws Exception {
        JSONObject request=new JSONObject().put("symbol","ETH-USD").put("side","buy").put("type","limit")
            .put("quantity","0.000000000000000123").put("limit_price","1234.5678").put("client_order_id","131de903-5a9c-4260-abc1-28d562a5dcf0");
        JSONObject result=RobinhoodProtocol.order(request);
        assertEquals("0.000000000000000123",result.getJSONObject("limit_order_config").getString("asset_quantity"));
        assertEquals("1234.5678",result.getJSONObject("limit_order_config").getString("limit_price"));
        request.put("symbol","AAPL");try{RobinhoodProtocol.order(request);fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void onlyFixedCryptoPathsAreAccepted(){
        assertTrue(RobinhoodProtocol.allowedPath("GET","/api/v2/crypto/trading/accounts/"));
        assertTrue(RobinhoodProtocol.allowedPath("POST","/api/v2/crypto/trading/orders/?account_number=CRYPTO-123"));
        assertFalse(RobinhoodProtocol.allowedPath("POST","https://example.org/steal"));
        assertFalse(RobinhoodProtocol.allowedPath("POST","/api/v2/crypto/trading/accounts/"));
        assertFalse(RobinhoodProtocol.allowedPath("GET","/api/v2/crypto/trading/orders/../accounts/"));
    }
}
