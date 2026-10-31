package com.entidadlaplace.mobile;

import org.json.JSONObject;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Foreground-only public ticker feed. One connection subscribes to ticker
 * + heartbeat for BTC / ETH / SOL. No trading, accounts or private URLs.
 * Reconnects with backoff, stops when app is backgrounded, coalesces tick
 * bursts before crossing Android's JavaScript bridge.
 */
public final class CoinbaseLiveFeed {
    public interface Sink { void onLiveEvent(JSONObject message); }
    private static final long INACTIVE_MS=45_000;
    private static final String[] SYMBOLS={"BTC-USD","ETH-USD","SOL-USD"};
    private final Object mutex=new Object();
    private final Sink sink;
    private final OkHttpClient http=new OkHttpClient.Builder()
        .connectTimeout(12,TimeUnit.SECONDS)
        .pingInterval(20,TimeUnit.SECONDS)
        .build();
    private final ScheduledExecutorService clock=Executors.newSingleThreadScheduledExecutor();
    private final Map<String,JSONObject> awaiting=new HashMap<>();
    private final Map<String,JSONObject> lastTick=new HashMap<>();
    private final Map<String,Long> lastSeq=new HashMap<>();
    private WebSocket socket;
    private ScheduledFuture<?> retry;
    private long lastReceivedAt=0L,connectionStartedAt=0L;
    private int generation=0,attempts=0;
    private boolean userEnabled=true,foreground=false,closed=false,subscribed=false;
    private String state="paused";

    public CoinbaseLiveFeed(Sink sink){
        this.sink=sink;
        clock.scheduleAtFixedRate(this::flush,300,300,TimeUnit.MILLISECONDS);
        clock.scheduleAtFixedRate(this::watchdog,10,10,TimeUnit.SECONDS);
    }

    public void resume(){
        synchronized(mutex){
            if(closed)return;
            foreground=true;
            if(userEnabled)connectLocked();
            else publishState("off","Transmisión desactivada",0);
        }
    }

    public void pause(){
        synchronized(mutex){
            if(closed)return;
            foreground=false;
            disconnectLocked("paused","App en segundo plano; sin conexión activa");
        }
    }

    /** Triggered by the on-screen control, also replays current status. */
    public void start(){
        synchronized(mutex){
            if(closed)return;
            userEnabled=true;
            if(foreground&&socket==null)connectLocked();
            else publishState(state,detailFor(state),0);
            for(JSONObject tick:lastTick.values())publish(tick);
        }
    }

    public void stop(){
        synchronized(mutex){
            if(closed)return;
            userEnabled=false;
            disconnectLocked("off","Transmisión detenida por el usuario");
        }
    }

    public void shutdown(){
        synchronized(mutex){
            if(closed)return;
            closed=true;
            foreground=false;
            disconnectLocked("off","Conexión finalizada");
        }
        clock.shutdownNow();
        http.dispatcher().executorService().shutdown();
        http.connectionPool().evictAll();
    }

    private String detailFor(String s){
        if("live".equals(s))return "Ticker y latidos de Coinbase recibidos";
        if("subscribing".equals(s))return "Confirmando canales de Coinbase";
        if("connecting".equals(s))return "Conectando a Coinbase";
        if("retrying".equals(s))return "Reconectando automáticamente";
        if("off".equals(s))return "Transmisión detenida";
        return "Sin conexión de mercado";
    }

    private void connectLocked(){
        if(!userEnabled||!foreground||closed||socket!=null||retry!=null)return;
        int session=++generation;
        subscribed=false;
        lastReceivedAt=0L;
        connectionStartedAt=System.currentTimeMillis();
        awaiting.clear();
        lastSeq.clear();
        state="connecting";
        publishState("connecting","Abriendo conexión WebSocket segura",0);
        Request request=new Request.Builder().url(LiveTickerProtocol.ENDPOINT)
            .header("User-Agent","LAPLACE-Android/3.2 (public ticker, no trading)")
            .build();
        socket=http.newWebSocket(request,new WebSocketListener(){
            @Override public void onOpen(WebSocket ws,Response response){
                synchronized(mutex){
                    if(session!=generation||closed||!foreground||!userEnabled){
                        ws.cancel();return;
                    }
                    try{
                        if(!ws.send(LiveTickerProtocol.subscription()))
                            throw new IllegalStateException("Falló subscribe");
                        state="subscribing";
                        publishState("subscribing","Esperando confirmación ticker + heartbeat",0);
                    }catch(Exception e){failLocked(session,"Suscripción no enviada");}
                }
            }

            @Override public void onMessage(WebSocket ws,String payload){
                if(payload==null||payload.length()>16_384)return;
                try{
                    JSONObject message=new JSONObject(payload);
                    String type=message.optString("type","");
                    synchronized(mutex){
                        if(session!=generation||!foreground||!userEnabled||closed)return;
                        lastReceivedAt=System.currentTimeMillis();
                        if("subscriptions".equals(type)){
                            if(!LiveTickerProtocol.subscribed(payload)){
                                failLocked(session,"Coinbase no confirmó los seis canales");return;
                            }
                            subscribed=true;attempts=0;state="live";
                            publishState("live","WebSocket ticker + heartbeat: BTC, ETH y SOL",0);
                        }else if("ticker".equals(type)&&subscribed){
                            JSONObject tick=LiveTickerProtocol.parseTicker(payload,lastReceivedAt);
                            String symbol=tick.getString("asset");
                            long next=tick.getLong("sequence");
                            Long previous=lastSeq.get(symbol);
                            if(previous!=null&&next<=previous)return;
                            JSONObject prior=lastTick.get(symbol);
                            if(prior!=null&&tick.getLong("observedAt")<
                                prior.optLong("observedAt",0))return;
                            lastSeq.put(symbol,next);
                            lastTick.put(symbol,tick);
                            awaiting.put(symbol,tick);
                        }else if("heartbeat".equals(type)){
                            // A heartbeat proves connection, NOT a new traded price.
                            if(!LiveTickerProtocol.isHeartbeat(payload))return;
                        }else if("error".equals(type)){
                            failLocked(session,"Coinbase rechazó la suscripción");
                        }
                    }
                }catch(Exception ignored){
                    // Malformed frame is never a market price or reason to crash.
                }
            }

            @Override public void onClosing(WebSocket ws,int code,String reason){
                ws.close(1000,"Laplace closing");
            }
            @Override public void onClosed(WebSocket ws,int code,String reason){
                synchronized(mutex){
                    if(session==generation&&foreground&&userEnabled&&!closed)
                        failLocked(session,"Conexión cerrada ("+code+")");
                }
            }
            @Override public void onFailure(WebSocket ws,Throwable error,Response response){
                synchronized(mutex){
                    if(session!=generation||!foreground||!userEnabled||closed)return;
                    int code=response==null?0:response.code();
                    failLocked(session,code>0?"Coinbase HTTP "+code:"Conexión interrumpida");
                }
            }
        });
    }

    private void failLocked(int session,String reason){
        if(session!=generation||closed||!foreground||!userEnabled)return;
        WebSocket previous=socket;
        socket=null;
        generation++;
        subscribed=false;
        awaiting.clear();
        if(previous!=null)previous.cancel();
        if(retry!=null){retry.cancel(false);retry=null;}
        // At most one attempt per 2/4/8/16/32/60 seconds.
        int delay=Math.min(60,2*(1<<Math.min(attempts,5)));
        attempts++;
        state="retrying";
        publishState("retrying",reason,delay);
        retry=clock.schedule(()->{
            synchronized(mutex){
                retry=null;
                if(foreground&&userEnabled&&!closed&&socket==null)connectLocked();
            }
        },delay,TimeUnit.SECONDS);
    }

    private void disconnectLocked(String status,String message){
        ++generation;
        if(retry!=null){retry.cancel(false);retry=null;}
        WebSocket previous=socket;socket=null;
        awaiting.clear();
        subscribed=false;
        state=status;attempts=0;
        if(previous!=null)previous.close(1000,"LAPLACE lifecycle");
        publishState(status,message,0);
    }

    private void watchdog(){
        synchronized(mutex){
            if(closed||!userEnabled||!foreground||socket==null)return;
            final long now=System.currentTimeMillis();
            if(!subscribed&&connectionStartedAt>0&&now-connectionStartedAt>25_000L)
                failLocked(generation,"No se confirmó la suscripción de Coinbase");
            else if(subscribed&&lastReceivedAt>0&&now-lastReceivedAt>INACTIVE_MS)
                failLocked(generation,"Sin latidos de Coinbase; enlace posiblemente perdido");
        }
    }

    private void flush(){
        Map<String,JSONObject> batch;
        synchronized(mutex){
            if(!foreground||closed||!userEnabled||awaiting.isEmpty())return;
            batch=new HashMap<>(awaiting);awaiting.clear();
        }
        for(String symbol:SYMBOLS){
            JSONObject tick=batch.get(symbol);
            if(tick!=null)publish(tick);
        }
    }

    private void publishState(String status,String detail,int retrySeconds){
        try{
            JSONObject msg=new JSONObject();
            msg.put("type","status");
            msg.put("state",status);
            msg.put("message",detail);
            msg.put("retrySeconds",retrySeconds);
            msg.put("receivedAt",System.currentTimeMillis());
            publish(msg);
        }catch(Exception ignored){}
    }

    private void publish(JSONObject event){sink.onLiveEvent(event);}
}
