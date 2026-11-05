package com.entidadlaplace.mobile;
import org.junit.Test;
import org.json.JSONObject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.zip.GZIPInputStream;
import static org.junit.Assert.*;
public class CampaignNativeTest {
 private static String unzip(byte[] encoded)throws Exception{
  ByteArrayOutputStream out=new ByteArrayOutputStream();
  try(GZIPInputStream in=new GZIPInputStream(new ByteArrayInputStream(Base64.getMimeDecoder().decode(encoded)))){
   byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
  }return new String(out.toByteArray(),StandardCharsets.UTF_8);
 }
 @Test public void packagedCampaignIsAnActualRestorableNativeModel()throws Exception{
  Path root=Path.of(System.getProperty("laplace.repo"));
  JSONObject data=new JSONObject(unzip(Files.readAllBytes(root.resolve("evidencia/campana-c02/datos/BTC-USD-300.json.gz.b64"))));
  JSONObject packaged=new JSONObject(unzip(Files.readAllBytes(root.resolve("apps/laplace-android/app/src/main/assets/campaign-models/BTC-USD-300-3.json.gz.b64"))));
  CampaignStore.validate(packaged);
  String template=new String(Files.readAllBytes(root.resolve("apps/laplace-android/app/src/main/assets/lqc-native.xi")),StandardCharsets.UTF_8);
  long asof=data.getJSONArray("rows").getJSONArray(data.getJSONArray("rows").length()-1).getLong(0)+300;
  String program=CampaignCompiler.compile("BTC-USD",300,15,data.getJSONArray("rows"),asof,template);
  NativeQuantumTemporal.validateCheckpoint(packaged.getString("checkpoint"),"BTC-USD",300,15,false,asof);
  JSONObject result=new JSONObject(NativeQuantumTemporal.executeProgram(program,packaged.getString("checkpoint")));
  assertEquals(3,result.getInt("algorithmVersion"));assertEquals(1000,result.getInt("qubits"));assertEquals(1,result.getInt("components"));
  assertEquals(0,result.getInt("onlineUpdates"));assertEquals(216,result.getJSONObject("campaign").getInt("candidates"));
  assertEquals(packaged.getString("checkpoint"),result.getString("checkpoint"));
  assertEquals(result.getJSONObject("test").getInt("cases"),result.getJSONObject("referenceTest").getInt("cases"));
 }
 @Test public void campaignWindowsSupportTheRequestedLongHorizons(){
  assertEquals(2,CampaignCompiler.horizon("BTC-USD",86400,2880));
  assertEquals(14,CampaignCompiler.horizon("BTC-USD",86400,20160));
  assertEquals(8,CampaignCompiler.horizon("BTC-USD",3600,480));
  assertEquals(1,CampaignCompiler.horizon("AAPL",3600,60));
  assertTrue(MarketCatalog.allowedHistoryDays(300,"BTC-USD",14));
  assertTrue(MarketCatalog.allowedHistoryDays(300,"BTC-USD",28));
  assertFalse(MarketCatalog.allowedHistoryDays(300,"BTC-USD",10000));
 }
}
