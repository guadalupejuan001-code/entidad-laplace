// Display adapter only: probabilities and distributions must already exist in
// native output. No transition solver, return bootstrap or RNG in this module.
export const VIEW_SCHEMA='laplace-native-temporal-v1';
const DAY=86400000,need=(ok,message)=>{if(!ok)throw Error(message)};
export function dayNumber(raw){
  need(typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw),'fecha invalida');const value=Date.parse(raw+'T00:00:00Z');
  need(Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===raw,'fecha invalida');return Math.floor(value/DAY);
}
export const dayString=day=>new Date(day*DAY).toISOString().slice(0,10);
export function selectionMask(profile,themes){
  need(Array.isArray(themes)&&new Set(themes).size===themes.length&&themes.every(theme=>profile.features.includes(theme)),'temas desconocidos o duplicados');
  return profile.features.reduce((mask,feature,i)=>mask|(themes.includes(feature)?1<<i:0),0);
}
export function selectNativeTime(profile,date,themes=profile.default_themes){
  need(profile?.schema===VIEW_SCHEMA,'perfil temporal retirado o incompatible');dayNumber(date);
  need(date>=profile.range_start&&date<=profile.range_end,'fecha fuera del intervalo');
  if(date<profile.origin_date){
    const row=profile.history.find(item=>item.decision_at.slice(0,10)===date);
    return row?{...row,mode:'historical',date}:{mode:'historical_unavailable',date,probability:null};
  }
  const horizon=dayNumber(date)-dayNumber(profile.last_observed_date);
  need(horizon>=0&&horizon<=profile.max_computed_horizon_days,'perfil incompleto para la fecha solicitada');
  const mask=selectionMask(profile,themes),forecast=profile.forecasts.find(row=>row.initial_mask===mask);
  if(!forecast?.trace?.[horizon])return {mode:'unseen_state',date,initial_mask:mask,probability:null,status:'abstencion_estado_no_observado'};
  const row=forecast.trace[horizon];
  return {...row,mode:'native',date,horizon_days:horizon,initial_mask:mask,
    tested:(profile.tested_horizon_days??[]).includes(horizon),validated:profile.validated_horizon_days.includes(horizon),native_program_sha256:profile.native_program_sha256,
    native_output_sha256:profile.native_output_sha256,arithmetic:'native-classical'};
}
