/* Confianza empírica de emisiones posteriores. P(subida), calibración y
 * calidad de datos se muestran separadas. Un porcentaje interno no se infla.
 */
const finite=Number.isFinite;
function wilson(k,n){
  if(!n)return null;
  const z=1.959963984540054,p=k/n,den=1+z*z/n;
  const middle=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
  return [Math.max(0,middle-half),Math.min(1,middle+half)];
}
export function medirConfianzaInterna(records,current,{asOf=current?.issuedAt??Date.now()/1000}={}){
  if(!Array.isArray(records)||!current||!finite(asOf))throw Error('Confianza: entrada inválida');
  const bins=Array.from({length:5},()=>({cases:0,up:0,predicted:0})),ids=new Set();
  let lastClose=-Infinity,brier=0,directionCorrect=0,n=0;
  const eligible=records.filter(f=>f?.status==='verified'&&!f.importedFromFile&&
    f.asset===current.asset&&f.minutes===current.minutes&&f.granularity===current.granularity&&
    f.kernelSHA256===current.kernelSHA256&&(f.algorithmVersion??1)===(current.algorithmVersion??1)&&
    finite(f.issuedAt)&&finite(f.sourceCloseAt)&&finite(f.observedCloseAt)&&finite(f.checkedAt)&&
    f.issuedAt>=current.training?.initialTestThrough&&f.issuedAt<asOf&&f.checkedAt<=asOf&&
    f.sourceCloseAt<=f.issuedAt&&f.observedCloseAt>f.issuedAt&&f.observedCloseAt<=asOf&&
    finite(f.probabilityUp)&&f.probabilityUp>0&&f.probabilityUp<1&&
    finite(f.reference)&&f.reference>0&&finite(f.measurement?.[0]?.actual)&&f.measurement[0].actual>0)
    .sort((a,b)=>a.sourceCloseAt-b.sourceCloseAt||a.issuedAt-b.issuedAt||String(a.id).localeCompare(String(b.id)));
  for(const f of eligible){
    const key=f.originTime;
    if(ids.has(key)||f.sourceCloseAt<lastClose)continue;
    ids.add(key);lastClose=f.observedCloseAt;
    const up=Number(f.measurement[0].actual>f.reference),bin=bins[Math.min(4,Math.floor(f.probabilityUp*5))];
    bin.cases++;bin.up+=up;bin.predicted+=f.probabilityUp;
    brier+=(f.probabilityUp-up)**2;directionCorrect+=Number((f.probabilityUp>.5)===(up===1));n++;
  }
  const bucket=Math.min(4,Math.max(0,Math.floor(current.probabilityUp*5))),selected=bins[bucket];
  const currentValid=finite(current.probabilityUp)&&current.probabilityUp>0&&current.probabilityUp<1;
  if(!currentValid)throw Error('Confianza: probabilidad inválida');
  return {schema:'laplace-empirical-confidence-c03-v1',as_of:asOf,
    estimated_probability_up:current.probabilityUp,
    estimated_classifier_confidence:Math.max(current.probabilityUp,1-current.probabilityUp),
    status:selected.cases<30?'insufficient_similar_prospective_outcomes':'empirical_evidence_available',
    required_similar_cases:30,nonoverlapping_cases:n,similar_cases:selected.cases,
    observed_up_rate:selected.cases?selected.up/selected.cases:null,
    observed_up_rate_interval_95:wilson(selected.up,selected.cases),
    interval_assumption:'Wilson_binomial_approximation_nonoverlap_does_not_prove_independence',
    classifier_accuracy:n?directionCorrect/n:null,brier:n?brier/n:null,
    calibration_error:n?bins.reduce((s,b)=>s+(b.cases?Math.abs(b.predicted/b.cases-b.up/b.cases)*b.cases/n:0),0):null,
    probability_bucket:[bucket/5,(bucket+1)/5],
    forecasts_deduplicated:true,overlapping_targets_excluded:true,
    imported_records_excluded:true,historical_test_not_counted_as_prospective:true,
    confidence_is_not_a_guarantee:true};
}
