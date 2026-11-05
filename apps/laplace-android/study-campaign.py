"""C02 native campaign, paired temporal test and actual packaged checkpoints."""
import base64,gzip,hashlib,json,math,subprocess,tempfile
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'evidencia/campana-c02/datos'
OUT=ROOT/'evidencia/campana-c02/resultados.json'
ASSETS=ROOT/'apps/laplace-android/app/src/main/assets'
RUNNER=ROOT/'build/campaign-runner'
FROZEN='8b6545b12765426a9957b1441d6eec609db107eb'

def kernel_hash():
    native=ROOT/'apps/laplace-android/app/src/main/cpp'
    return hashlib.sha256((native/'laplace_temporal.hpp').read_bytes()+b'\n'+(native/'laplace_campaign.hpp').read_bytes()).hexdigest()

def read_data(name,expected_sha256=None):
    path=DATA/name
    raw=path.read_bytes() if path.exists() else gzip.decompress(base64.b64decode(path.with_suffix(path.suffix+'.gz.b64').read_bytes()))
    if expected_sha256 is not None:assert hashlib.sha256(raw).hexdigest()==expected_sha256,'Campaign dataset hash differs: '+name
    return json.loads(raw)

def source(data,h,mode='quantum',rows=None):
    rows=data['rows'] if rows is None else rows;g=data['granularity'];asof=rows[-1][0]+g
    return f"lqc.configure {data['asset']} {g} {h} crypto {asof} {mode}\n"+''.join('lqc.candle '+' '.join(map(str,r[:6]))+' 0\n' for r in rows)+'lqc.run\n'

def execute(program,checkpoint=None):
    with tempfile.TemporaryDirectory(prefix='laplace-c02-') as tmp:
        f=Path(tmp)/'program.xi';f.write_text(program);args=[str(RUNNER),str(f)]
        if checkpoint is not None:
            s=Path(tmp)/'state.lqc';s.write_text(checkpoint);args.append(str(s))
        p=subprocess.run(args,capture_output=True,text=True,timeout=120)
        assert p.returncode==0,p.stderr
        return json.loads(p.stdout)

def close(a,b):
    if isinstance(a,dict):
        assert a.keys()==b.keys(),(a.keys(),b.keys())
        for k in a:close(a[k],b[k])
    elif isinstance(a,list):
        assert len(a)==len(b)
        for x,y in zip(a,b):close(x,y)
    elif isinstance(a,(int,float)) and not isinstance(a,bool):assert math.isclose(a,b,rel_tol=1e-8,abs_tol=1e-8),(a,b)
    else:assert a==b,(a,b)

def main():
    verify='--verify' in sys.argv
    manifest=read_data('manifest.json');results=[];models=[]
    if not verify:
        (ASSETS/'campaign-models').mkdir(exist_ok=True)
        for path in DATA.glob('*.json'):
            path.with_suffix('.json.gz.b64').write_bytes(base64.b64encode(gzip.compress(path.read_bytes(),mtime=0))+b'\n')
    for ds in manifest['datasets']:
        data=read_data(ds['file'],ds['sha256']);rows=data['rows'];g=data['granularity']
        if g==300:horizons=[1,3,6,12,24]
        elif g==3600:horizons=[4,5,8,12,24]
        else:horizons=[2,3,7,14]
        # The whole intraday test begins after the old archive cutoff.
        for h in horizons:
            minutes=h*g//60;result=execute(source(data,h));checkpoint=result.pop('checkpoint')
            key=f"{data['asset']}-{g}-{h}";checkpoint_hash=hashlib.sha256(checkpoint.encode()).hexdigest()
            entry={'schema':'laplace-campaign-checkpoint-v1','asset':data['asset'],'granularity':g,'minutes':minutes,
                   'kernelSHA256':kernel_hash(),'checkpointSHA256':checkpoint_hash,'checkpoint':checkpoint}
            model_path=ASSETS/'campaign-models'/f'{key}.json.gz.b64'
            if not verify:model_path.write_bytes(base64.b64encode(gzip.compress(json.dumps(entry,separators=(',',':')).encode(),mtime=0))+b'\n')
            else:
                packaged=json.loads(gzip.decompress(base64.b64decode(model_path.read_bytes())))
                assert packaged['kernelSHA256']==kernel_hash()
                assert hashlib.sha256(packaged['checkpoint'].encode()).hexdigest()==packaged['checkpointSHA256']
                replay=execute(source(data,h),packaged['checkpoint']);assert replay['onlineUpdates']==0
                close(replay['outputs'],result['outputs']);close(replay['test'],result['test'])
            record={k:result[k] for k in ['asset','granularity','horizonBars','algorithmVersion','qubits','components','graphEdges','updatedRotations','test','referenceTest','campaign','sourceCloseAt','targetCloseAt','reference','probabilityUp','outputs']}
            record['minutes']=minutes;record['dataSHA256']=ds['sha256'];record['firstTestOrigin']=rows[len(rows)*85//100][0]
            results.append(record)
            models.append({'key':key,'asset':data['asset'],'granularity':g,'minutes':minutes,'file':model_path.name,
                'packagedSHA256':hashlib.sha256(model_path.read_bytes()).hexdigest(),'initialThrough':result['initialTestThrough']})
            q=result['test'];old=result['referenceTest']
            print(json.dumps({'asset':data['asset'],'minutes':minutes,'cases':q['cases'],'correct':q['directionCorrect'],'previous':old['directionCorrect'],'priceMAE':q['outputs'][0]['mae'],'previousMAE':old['outputs'][0]['mae']}),flush=True)
    report={'schema':'laplace-native-campaign-c02-v1','algorithmVersion':3,'algorithmFrozenCommit':FROZEN,
            'kernelSHA256':kernel_hash(),'captureRun':41941370265,'capture':manifest,'models':models,'results':results,
            'protocol':{'trainFraction':.6,'selectionFraction':.15,'calibrationFraction':.1,'testFraction':.15,
                        'trainCap':512,'validationCap':128,'testCap':256,'configurationsPerContext':216,
                        'selection':'validation only; test never selects a model','encoder':'1000 connected qubits; fixed after initial campaign',
                        'onlineLearning':'regularized readout, only newly matured labels; no test recycling',
                        'pairedReference':'C01 evaluated at exactly the same origins and targets',
                        'coverage':'all test cases; selective metrics are additional and carry counts',
                        'newIntradayHoldout':'test dates after the previous October 30 cutoff; historical snapshots, not prospective forecasts'},
            'prospectivelyValidated':False,'automaticTrading':False}
    if verify:close(report,json.loads(OUT.read_text()))
    else:
        OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        release={'schema':'laplace-campaign-release-v1','algorithmVersion':3,'kernelSHA256':kernel_hash(),'models':models,
                 'capturedAt':manifest['capturedAt'],'results':results,'prospectivelyValidated':False}
        (ASSETS/'campaign-evidence.js').write_text('window.LAPLACE_CAMPAIGN_RELEASE = '+json.dumps(release,separators=(',',':'))+';\n')
    print(json.dumps({'contexts':len(results),'directionImproved':sum(x['test']['directionCorrect']>x['referenceTest']['directionCorrect'] for x in results),'directionTied':sum(x['test']['directionCorrect']==x['referenceTest']['directionCorrect'] for x in results),'allModelsActuallyPackaged':True}),flush=True)

if __name__=='__main__':main()
