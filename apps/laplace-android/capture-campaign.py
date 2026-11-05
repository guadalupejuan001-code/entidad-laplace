"""Public closed OHLCV capture for the explicitly requested C02 campaign."""
import datetime,hashlib,json,time,urllib.request
from pathlib import Path

OUT=Path('build/campaign-capture');OUT.mkdir(parents=True,exist_ok=True)
cutoff=int(time.time())//300*300
datasets=[]
for asset,g,days in [('BTC-USD',300,28),('ETH-USD',300,28),('SOL-USD',300,28),
                     ('BTC-USD',3600,360),('BTC-USD',86400,2200),
                     ('ETH-USD',3600,360),('ETH-USD',86400,2200)]:
    end=cutoff//g*g;first=end-days*86400;rows={};urls=[]
    while end>first:
        start=max(first,end-280*g)
        def iso(t):return datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat().replace('+00:00','Z')
        url=f'https://api.exchange.coinbase.com/products/{asset}/candles?granularity={g}&start={iso(start)}&end={iso(end)}'
        for attempt in range(3):
            try:
                request=urllib.request.Request(url,headers={'User-Agent':'LAPLACE-C02-Research','Accept':'application/json'})
                with urllib.request.urlopen(request,timeout=20) as response:data=json.load(response)
                assert isinstance(data,list),'Expected OHLCV list'
                break
            except Exception:
                if attempt==2:raise
                time.sleep(1+attempt*2)
        for row in data:
            if len(row)<6:continue
            row=row[:6];t=int(row[0])
            if start<=t<end and t%g==0 and t+g<=cutoff:
                if t in rows:assert rows[t]==row,'Conflicting candle'
                rows[t]=row
        urls.append(url);end=start;time.sleep(.38)
    ordered=[rows[t] for t in sorted(rows)]
    assert len(ordered)>=400,f'Insufficient {asset}/{g}'
    content={'schema':'laplace-c02-closed-ohlcv-v1','asset':asset,'granularity':g,
             'capturedAt':cutoff,'firstRequested':first,'rows':ordered,'sources':urls,
             'availability':'historical snapshot; not a prospective forecast record'}
    path=OUT/f'{asset}-{g}.json';path.write_text(json.dumps(content,separators=(',',':'))+'\n')
    datasets.append({'asset':asset,'granularity':g,'rows':len(ordered),'first':ordered[0][0],
                     'lastClose':ordered[-1][0]+g,'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    print(json.dumps(datasets[-1]),flush=True)
(OUT/'manifest.json').write_text(json.dumps({'schema':'laplace-campaign-capture-v1','capturedAt':cutoff,'datasets':datasets},indent=2)+'\n')
