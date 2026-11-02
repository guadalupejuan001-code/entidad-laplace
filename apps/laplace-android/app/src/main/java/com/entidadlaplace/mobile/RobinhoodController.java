package com.entidadlaplace.mobile;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import org.json.JSONArray;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Sólo operaciones manuales. Preparar consulta; enviar exige diálogo nativo. */
final class RobinhoodController {
    interface Callback {void accept(String id,JSONObject response);}
    private final Activity activity;private final Callback callback;
    private final RobinhoodVault vault;private final RobinhoodClient client;
    private final SharedPreferences journal;private final ExecutorService serial=Executors.newSingleThreadExecutor();
    private JSONObject prepared;private int connectionGeneration=0;private volatile boolean dialogOpen=false;
    RobinhoodController(Activity a,Callback c){activity=a;callback=c;vault=new RobinhoodVault(a);client=new RobinhoodClient(vault);
        journal=a.getSharedPreferences("laplace_robinhood_orders_v1",Context.MODE_PRIVATE);}
    void shutdown(){serial.shutdownNow();}
    private void success(String id,JSONObject result){try{callback.accept(id,new JSONObject().put("ok",true).put("result",result));}catch(Exception ignored){}}
    private void failure(String id,String message){try{callback.accept(id,new JSONObject().put("ok",false).put("error",message));}catch(Exception ignored){}}
    private JSONObject entries() throws Exception {return new JSONObject(journal.getString("entries","{}"));}
    private void record(String clientId,JSONObject entry) throws Exception {
        JSONObject items=entries();items.put(clientId,entry);
        if(!journal.edit().putString("entries",items.toString()).commit())throw new IllegalStateException("No se pudo guardar el diario de la orden; no se enviará");
    }
    void command(String id,String action,String payload){
        if(id==null||!id.matches("[A-Za-z0-9-]{1,80}")||payload==null||payload.length()>20000)return;
        serial.execute(()->{try{
            JSONObject input=new JSONObject(payload);
            switch(action){
                case "status":success(id,vault.status());break;
                case "generate":success(id,vault.generate());break;
                case "configure":connectionGeneration++;prepared=null;success(id,vault.configure(input.getString("api_key")));break;
                case "disconnect":connectionGeneration++;prepared=null;vault.disconnect();success(id,vault.status());break;
                case "accounts":success(id,client.request("GET","/api/v2/crypto/trading/accounts/",null));break;
                case "orders":orders(id,input);break;
                case "prepare":prepare(id,input);break;
                case "submit":submit(id,input);break;
                case "cancel":cancel(id,input);break;
                case "journal":success(id,new JSONObject().put("entries",entries()));break;
                default:throw new IllegalArgumentException("Acción Robinhood no admitida");
            }
        }catch(Exception error){failure(id,error.getMessage()==null?"No se pudo completar la operación":error.getMessage());}});
    }
    private JSONObject activeAccount(String number) throws Exception {
        JSONArray rows=client.request("GET","/api/v2/crypto/trading/accounts/",null).getJSONArray("results");
        for(int i=0;i<rows.length();i++){
            JSONObject a=rows.getJSONObject(i);
            if(number.equals(a.optString("account_number"))&&"active".equals(a.optString("status"))&&a.optBoolean("is_api_tradable",false))return a;
        }
        throw new IllegalArgumentException("La cuenta elegida no está activa para la API Crypto v2");
    }
    private void orders(String id,JSONObject input) throws Exception {
        String account=RobinhoodProtocol.account(input.getString("account_number"));
        String path="/api/v2/crypto/trading/orders/?account_number="+RobinhoodClient.encoded(account);
        String cursor=input.optString("cursor","");
        if(!cursor.isEmpty()){if(cursor.length()>2000)throw new IllegalArgumentException("Cursor inválido");path+="&cursor="+RobinhoodClient.encoded(cursor);}
        JSONObject result=client.request("GET",path,null);success(id,result);
    }
    private void prepare(String id,JSONObject input) throws Exception {
        if(dialogOpen)throw new IllegalStateException("Termina la revisión nativa de la orden anterior");
        String account=RobinhoodProtocol.account(input.getString("account_number"));
        JSONObject body=RobinhoodProtocol.order(input),acct=activeAccount(account);
        String symbol=body.getString("symbol"),side=body.getString("side"),type=body.getString("type");
        JSONObject config=body.getJSONObject(type+"_order_config");
        BigDecimal qty=new BigDecimal(config.getString("asset_quantity"));
        JSONArray pairs=client.request("GET","/api/v2/crypto/trading/trading_pairs/?symbol="+symbol,null).getJSONArray("results");
        JSONObject pair=null;for(int i=0;i<pairs.length();i++)if(symbol.equals(pairs.getJSONObject(i).optString("symbol")))pair=pairs.getJSONObject(i);
        if(pair==null||!pair.optBoolean("is_api_tradable",false)||
            !("tradable".equals(pair.optString("status"))||side.equals("sell")&&"sellonly".equals(pair.optString("status"))))
            throw new IllegalArgumentException("Este activo no admite esa operación mediante la API Robinhood");
        BigDecimal increment=new BigDecimal(pair.getString("asset_increment"));
        if(increment.signum()<=0||qty.remainder(increment).signum()!=0)throw new IllegalArgumentException("La cantidad debe ser múltiplo de "+increment.toPlainString());
        if(qty.compareTo(new BigDecimal(pair.getString("max_order_size")))>0)throw new IllegalArgumentException("Cantidad superior al máximo del activo");
        if(type.equals("limit")){
            BigDecimal price=new BigDecimal(config.getString("limit_price")),step=new BigDecimal(pair.getString("quote_increment"));
            if(step.signum()<=0||price.remainder(step).signum()!=0)throw new IllegalArgumentException("El precio debe ser múltiplo de "+step.toPlainString());
        }
        String quotePath="/api/v2/crypto/trading/estimated_price/?symbol="+symbol+"&side="+(side.equals("buy")?"ask":"bid")+"&quantity="+RobinhoodClient.encoded(qty.toPlainString());
        JSONArray prices=client.request("GET",quotePath,null).getJSONArray("results");
        if(prices.length()==0)throw new IllegalArgumentException("Robinhood no devolvió una estimación de ejecución");
        JSONObject quote=prices.getJSONObject(0);
        if(!symbol.equals(quote.optString("symbol")))throw new IllegalArgumentException("Estimación de otro activo");
        long quoteAt=java.time.Instant.parse(quote.getString("timestamp")).toEpochMilli();
        if(Math.abs(System.currentTimeMillis()-quoteAt)>30000)throw new IllegalArgumentException("Estimación Robinhood antigua; vuelve a preparar la orden");
        BigDecimal market=new BigDecimal(quote.get(side.equals("buy")?"ask":"bid").toString());
        if(market.signum()<=0)throw new IllegalArgumentException("Precio de ejecución no válido");
        BigDecimal reference=type.equals("limit")?new BigDecimal(config.getString("limit_price")):market;
        if(reference.multiply(qty).compareTo(new BigDecimal(pair.getString("min_order_amount")))<0)throw new IllegalArgumentException("Importe inferior al mínimo del activo");
        if(side.equals("buy")&&new BigDecimal(quote.get("est_total_cost").toString()).compareTo(new BigDecimal(acct.getString("buying_power")))>0)
            throw new IllegalArgumentException("Poder de compra insuficiente según Robinhood");
        if(side.equals("sell")){
            JSONArray holdings=client.request("GET","/api/v2/crypto/trading/holdings/?account_number="+RobinhoodClient.encoded(account)+"&asset_code="+symbol.replace("-USD",""),null).getJSONArray("results");
            BigDecimal available=BigDecimal.ZERO;for(int i=0;i<holdings.length();i++){
                JSONObject holding=holdings.getJSONObject(i);if(symbol.equals(holding.getString("asset_code")+"-USD"))available=new BigDecimal(holding.getString("quantity_available_for_trading"));
            }
            if(qty.compareTo(available)>0)throw new IllegalArgumentException("Cantidad disponible insuficiente según Robinhood");
        }
        prepared=new JSONObject().put("nonce",UUID.randomUUID().toString()).put("generation",connectionGeneration)
            .put("created_at",System.currentTimeMillis()).put("account_number",account).put("body",body).put("quote",quote)
            .put("reference",input.optString("forecast_ref",""));
        success(id,new JSONObject(prepared.toString()).put("real_order_sent",false));
    }
    private void submit(String id,JSONObject input) throws Exception {
        if(dialogOpen||prepared==null||!prepared.getString("nonce").equals(input.optString("nonce")))throw new IllegalStateException("Prepara y revisa la orden antes de enviarla");
        final JSONObject order=prepared;prepared=null;
        if(System.currentTimeMillis()-order.getLong("created_at")>60000||order.getInt("generation")!=connectionGeneration)
            throw new IllegalStateException("La preparación venció o cambió la conexión. Vuelve a preparar");
        final JSONObject body=order.getJSONObject("body");final String type=body.getString("type"),side=body.getString("side");
        final String message=(side.equals("buy")?"COMPRAR ":"VENDER ")+body.getJSONObject(type+"_order_config").getString("asset_quantity")+" "+body.getString("symbol")+
            "\nCuenta: "+order.getString("account_number")+"\nTipo: "+(type.equals("market")?"mercado":"límite "+body.getJSONObject(type+"_order_config").getString("limit_price")+" USD")+
            "\nComisión estimada: "+order.getJSONObject("quote").optString("est_fee","no disponible")+" USD"+
            "\nEsta orden usa fondos reales de tu cuenta Robinhood. El precio final de una orden a mercado puede cambiar.";
        dialogOpen=true;
        activity.runOnUiThread(()->{
            if(activity.isFinishing()){dialogOpen=false;failure(id,"La app ya no está activa");return;}
            new AlertDialog.Builder(activity).setTitle("Confirmar orden real · Robinhood Crypto")
                .setMessage(message).setCancelable(false)
                .setNegativeButton("Cancelar",(dialog,which)->{dialogOpen=false;try{success(id,new JSONObject().put("canceled_by_user",true));}catch(Exception ignored){}})
                .setPositiveButton("Enviar orden real",(dialog,which)->serial.execute(()->{
                    try{
                        if(connectionGeneration!=order.getInt("generation")||System.currentTimeMillis()-order.getLong("created_at")>60000)throw new IllegalStateException("La preparación venció; no se envió la orden");
                        sendOrder(id,order);
                    }catch(Exception error){failure(id,error.getMessage());}finally{dialogOpen=false;}
                })).show();
        });
    }
    private void sendOrder(String id,JSONObject preparedOrder) throws Exception {
        JSONObject body=preparedOrder.getJSONObject("body");String clientId=body.getString("client_order_id");
        if(entries().has(clientId))throw new IllegalStateException("Este identificador ya figura en el diario. Consulta el resultado; no se reenviará");
        JSONObject entry=new JSONObject().put("client_order_id",clientId).put("request",body)
            .put("account_number",preparedOrder.getString("account_number")).put("forecast_ref",preparedOrder.optString("reference"))
            .put("submitted_at",System.currentTimeMillis()).put("state","submission_started");
        record(clientId,entry);
        try{
            JSONObject result=client.request("POST","/api/v2/crypto/trading/orders/?account_number="+
                RobinhoodClient.encoded(preparedOrder.getString("account_number")),body);
            entry.put("state",result.optString("state","accepted")).put("response",result);record(clientId,entry);success(id,result);
        }catch(Exception error){
            if(error instanceof RobinhoodClient.ApiException){
                int code=((RobinhoodClient.ApiException)error).status;
                if(code>=400&&code<500&&code!=408&&code!=409){
                    entry.put("state","rejected").put("http_status",code);
                    try{record(clientId,entry);}catch(Exception ignored){}
                    failure(id,error.getMessage());return;
                }
            }
            entry.put("state","submission_uncertain");try{record(clientId,entry);}catch(Exception ignored){}
            failure(id,"El envío no quedó confirmado. Consulta las órdenes de Robinhood antes de intentar otra vez. ID: "+clientId);
        }
    }
    private void cancel(String id,JSONObject input) throws Exception {
        if(dialogOpen)throw new IllegalStateException("Termina la revisión anterior");
        String orderId=RobinhoodProtocol.uuid(input.getString("order_id"));dialogOpen=true;
        activity.runOnUiThread(()->{
            if(activity.isFinishing()){dialogOpen=false;failure(id,"La app ya no está activa");return;}
            new AlertDialog.Builder(activity).setTitle("Cancelar orden real")
            .setMessage("Solicitar a Robinhood la cancelación de la orden "+orderId+". Si ya se ejecutó, el bróker puede rechazar la cancelación.")
            .setCancelable(false).setNegativeButton("Conservar",(d,w)->{dialogOpen=false;try{success(id,new JSONObject().put("canceled_by_user",true));}catch(Exception ignored){}})
            .setPositiveButton("Solicitar cancelación",(d,w)->serial.execute(()->{try{
                success(id,client.request("POST","/api/v2/crypto/trading/orders/"+orderId+"/cancel/",null));
            }catch(Exception error){failure(id,"No se confirmó la cancelación. Actualiza el estado en Robinhood.");}finally{dialogOpen=false;}})).show();});
    }
}
