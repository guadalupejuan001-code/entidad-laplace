package com.entidadlaplace.mobile;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Lecturas permitidas. Nunca conecta la cuenta ni envía órdenes. */
public final class MarketCatalog {
    private MarketCatalog(){}
    private static final Set<String> CRYPTO=Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList("BTC-USD","ETH-USD","SOL-USD","DOGE-USD","XRP-USD","ADA-USD","LTC-USD","LINK-USD","AVAX-USD","BCH-USD")));
    private static final Set<String> EQUITIES=Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList("AAPL","NVDA","TSLA","AMD","MSFT","AMZN","GOOGL","META","PLTR","HOOD","COIN","MSTR","SOFI","NFLX","JPM","SPY","QQQ","DIA","IWM","VOO","VTI")));
    public static boolean isCrypto(String asset){return CRYPTO.contains(asset);}
    public static boolean isEquity(String asset){return EQUITIES.contains(asset);}
    public static boolean allowed(String asset){return isCrypto(asset)||isEquity(asset);}
    public static int days(int granularity,String asset){
        if(isCrypto(asset))return granularity==300?14:granularity==3600?45:granularity==86400?1000:-1;
        if(isEquity(asset))return granularity==300?30:granularity==3600?180:granularity==86400?1825:-1;
        return -1;
    }
    public static Set<String> equities(){return EQUITIES;}
    public static Set<String> cryptos(){return CRYPTO;}
}
