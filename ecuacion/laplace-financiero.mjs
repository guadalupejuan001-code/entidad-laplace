/**
 * Laplaciano real L φ = 0 sobre retornos LOGARÍTMICOS adimensionales.
 * No confundir interpolación armónica con predicción financiera.
 * F001 aporta fronteras candidatas; NO son resultados del futuro.
 */
export const LAPLACE_FIN_VERSION='laplace-financial-field-v1';
const need=(x,m)=>{if(!x)throw Error(m)};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function auditarUniversoLaplace(world,{asOf}={}){
  const raw=world?.universal_state?.states??world?.states;
  const states=Array.isArray(raw)?raw:[];
  const cut=Date.parse(asOf);
  need(Number.isFinite(cut),'Corte temporal no válido');
  need(states.length<=100000,'Presupuesto de auditoría excedido');
  const domains=new Map(),units=new Set(),discarded={
    future_known:0,bad_time:0,bad_value:0,bad_source:0
  };
  let valid=0,lastKnown=null;
  for(const state of states){
    const known=Date.parse(state?.known_at),observed=Date.parse(state?.observed_at);
    if(!Number.isFinite(known)||!Number.isFinite(observed)||known<observed){
      discarded.bad_time++;continue;
    }
    if(known>cut||observed>cut){discarded.future_known++;continue}
    if(!finite(state?.value)||typeof state.domain!=='string'||
       typeof state.variable!=='string'||typeof state.unit!=='string'){
      discarded.bad_value++;continue;
    }
    let okay=false;try{
      const u=new URL(state.source_url);okay=u.protocol==='https:'&&!u.username&&!u.password;
    }catch{}
    if(!okay){discarded.bad_source++;continue}
    valid++;
    domains.set(state.domain,(domains.get(state.domain)??0)+1);
    units.add(state.domain+'::'+state.unit);
    lastKnown=lastKnown===null?known:Math.max(lastKnown,known);
  }
  const groups=world?.groups??world?.coverage?.groups??[];
  const fund=groups.find(g=>g.group==='etf_fund_flows_c001');
  const f=Number(fund?.signals??0);
  return {schema:'laplace-public-world-audit-v1',as_of:asOf,
    archived_states:states.length,valid_at_cut:valid,
    rejected:discarded,domains:[...domains].map(([domain,count])=>({domain,count}))
       .sort((a,b)=>a.domain.localeCompare(b.domain)),
    distinct_domain_unit_pairs:units.size,
    latest_known_at:lastKnown===null?null:new Date(lastKnown).toISOString(),
    capture_at:world?.at??world?.captured_at??null,
    etf_fund_flow_status:!fund?'not_reported':f>0?'observed':String(fund.status??'no_data'),
    etf_fund_flow_signals:Number.isFinite(f)?f:0,
    original_source_count:world?.source_count??null,
    no_cross_unit_addition:true,applied_to_central_forecast:false,
    no_guessed_missing_values:true,automatic_trading:false};
}
/**
 * El grafo conecta SÓLO horizontes de un mismo activo, en log(t).
 * Los candidatos de precio son fronteras experimentales.
 * Incógnitas resueltas no se publican como precio pronosticado.
 */
export function aplicarLaplaceAHorizontes(rows,{
  quotePrice,asset='BTC-USD',solver,absTolerance=1e-9
}={}){
  need(Array.isArray(rows)&&rows.length>=2&&rows.length<=512,
    'Horizontes ausentes o fuera de presupuesto');
  need(typeof solver==='function','Falta solucionador de Laplace');
  need(finite(quotePrice)&&quotePrice>0,'Precio observado requerido');
  need(typeof asset==='string'&&asset.length>0,'Activo requerido');
  need(finite(absTolerance)&&absTolerance>0,'Tolerancia numérica requerida');
  const items=rows.map(row=>{
    const minutes=Number(row?.minutes);
    need(Number.isSafeInteger(minutes)&&minutes>0,'Horizonte inválido');
    const price=row.price_candidate??row.estimate??null;
    need(price===null||(finite(price)&&price>0),'Precio candidato no finito');
    need(!row.asset||row.asset===asset,'No mezclar instrumentos');
    return {minutes,price,candidateReturn:price===null?null:Math.log(price/quotePrice)};
  }).sort((a,b)=>a.minutes-b.minutes);
  need(items.every((x,i)=>i===0||x.minutes>items[i-1].minutes),
    'Horizontes duplicados');
  const known=items.map((x,i)=>x.candidateReturn===null?-1:i).filter(i=>i>=0);
  if(known.length<2)return {
    schema:LAPLACE_FIN_VERSION,asset,status:'abstained',
    reason:'fewer_than_two_valid_forecast_boundaries',
    available_candidate_anchors:known.length,operator:'graph_Laplacian',
    field:items.map(x=>({minutes:x.minutes,candidate_price:x.price,
      candidate_return:x.candidateReturn,laplace_return:null,
      laplace_price_for_trading:null,field_status:'sin_fronteras_suficientes'})),
    candidate_prices_unchanged:true,automatic_trading:false};
  const first=known[0],last=known.at(-1);
  const nodes=items.slice(first,last+1).map(x=>({id:String(x.minutes),value:x.candidateReturn}));
  const edges=[];
  for(let i=1;i<nodes.length;i++){
    const a=Number(nodes[i-1].id),b=Number(nodes[i].id);
    const separation=Math.log(b)-Math.log(a);
    need(finite(separation)&&separation>0,'Eje de tiempo inválido');
    edges.push({from:String(a),to:String(b),weight:1/separation});
  }
  const result=solver({nodes,edges,tolerance:absTolerance,omega:1.3,maxIterations:30000});
  need(result&&Array.isArray(result.nodes),'Respuesta de Laplace incompleta');
  const lookup=new Map(result.nodes.map(x=>[Number(x.id),x]));
  const field=items.map((x,i)=>{
    const inside=i>=first&&i<=last,solution=inside&&result.converged?lookup.get(x.minutes):null;
    return {minutes:x.minutes,candidate_price:x.price,candidate_return:x.candidateReturn,
      laplace_return:solution?.value??null,laplace_price_for_trading:null,
      field_status:!inside?'outside_interpolation_domain':
        !result.converged?'solver_not_converged':
        x.price===null?'harmonic_interpolation_not_market_forecast':
          'observed_model_candidate_anchor'};
  });
  let maximum=0;
  if(result.converged){
    const values=nodes.map(x=>lookup.get(Number(x.id)).value);
    for(let i=0;i<values.length;i++){
      if(nodes[i].value===null)continue;
      let force=0,total=0;
      for(let j=Math.max(0,i-1);j<=Math.min(i+1,values.length-1);j++){
        if(i===j)continue;
        const weight=edges[Math.min(i,j)].weight;
        force+=weight*(values[i]-values[j]);
        total+=weight;
      }
      if(total>0)maximum=Math.max(maximum,Math.abs(force/total));
    }
  }
  return {schema:LAPLACE_FIN_VERSION,asset,status:result.converged?'calculated':'not_converged',
    equation:'sum_j w_ij(phi_i-phi_j)=0',
    operator:'weighted_graph_Laplacian_on_log_returns',
    graph_hypothesis:'adjacent_horizons_weight_inverse_log_duration',
    boundary_type:'model_candidates_not_real_future_values',
    available_candidate_anchors:known.length,
    interpolated_horizons:field.filter(x=>x.field_status==='harmonic_interpolation_not_market_forecast').length,
    convergence:result.converged,iterations:result.iterations,
    max_unknown_residual:result.max_residual,max_anchor_inconsistency:maximum,
    field,candidate_prices_unchanged:true,model_advantage_proven:false,
    prediction_intervals_calibrated:false,automatic_trading:false};
}
