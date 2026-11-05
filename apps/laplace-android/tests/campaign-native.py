"""Native campaign retention, chronology and held-out perturbation checks."""
import importlib.util,json
from pathlib import Path
root=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('campaign',root/'apps/laplace-android/study-campaign.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
data=m.read_data('BTC-USD-300.json');rows=data['rows'];short=rows[:-24]
initial=m.execute(m.source(data,3,rows=short));restored=m.execute(m.source(data,3,rows=short),initial['checkpoint'])
assert restored['checkpoint']==initial['checkpoint'];assert restored['outputs']==initial['outputs']
later=m.execute(m.source(data,3),initial['checkpoint']);expected=8 if initial['campaign']['pooledWeight']>0 else 0
assert later['onlineUpdates']==expected
repeated=m.execute(m.source(data,3),later['checkpoint']);assert repeated['checkpoint']==later['checkpoint'];assert repeated['onlineUpdates']==0

def parameters(s):
    header,length,tail=s.split('\n',2);n=int(length);native=tail[:n].splitlines();rest=tail[n:].splitlines()
    # Exclude evaluation metrics and accepted-test counts, retain every fitted
    # circuit/readout coefficient, normalization and calibration quantity.
    return (native[2:6]+native[6:13],rest[0].split()[:-2],rest[1:6])

original=m.execute(m.source(data,3));changed=[r[:] for r in rows]
for row in changed[len(rows)*85//100:]:
    for k in [1,2,3,4]:row[k]*=1.03
    row[5]*=1.2
altered=m.execute(m.source(data,3,rows=changed))
assert parameters(original['checkpoint'])==parameters(altered['checkpoint'])
assert original['campaign']['regularization']==altered['campaign']['regularization']
assert original['campaign']['pooledWeight']==altered['campaign']['pooledWeight']
assert (original['outputs'][0]['predicted']>original['reference'])==(original['probabilityUp']>.5)
assert len(json.loads((root/'evidencia/campana-c02/resultados.json').read_text())['models'])==33
print(json.dumps({'saveRestoreExact':True,'laterReadoutUpdates':expected,'duplicateLabelsIgnored':True,
                  'heldOutPerturbationDoesNotChangeFittedParameters':True,'priceProbabilityCoherent':True,'packagedModels':33}))
