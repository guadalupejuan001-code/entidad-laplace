#!/usr/bin/env node
/* V001: verify real archived M001 journal and historical U003 snapshot.
 * Strict: no synthetic data. No network, money, accounts, or trading.
 * The audit is NOT a claim of out-of-sample predictive superiority.
 */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {leerDiario,resumir} from '../seguimiento/diario.mjs';
import {huellaContenido,sellarCaptura} from '../universo/integridad.mjs';
import {evaluarJournalM001,compararAblacionesPareadas} from '../validacion/predicciones-v001.mjs';
import {auditarCapturaMundial,auditarMatrizFuentes,V001_SCHEMA} from '../validacion/cobertura-v001.mjs';

const SOURCE='evidencia/entrenamiento-x002-20261030/m001-prospectivo/';
const WORLD='evidencia/continuidad-u003-20261030/captura-integrada.json';
const need=(x,m)=>{if(!x)throw Error(m)};
const hash=s=>createHash('sha256').update(s).digest('hex');
const now=new Date().toISOString();
const args=process.argv.slice(2),options={};
const usage=()=>console.log('Uso: npm run validar:v001 -- [--out=ruta-nueva.json] [--pares=archivo-pares-ablation.json]\nAudita diario histórico real M001, su SHA256, resultados y captura mundial U003 sellada; compara con persistencia.\nSin pares de modelos congelados NO informa mejora mundial. Nunca opera dinero.');
if(args.includes('--help')||args.includes('--ayuda'))usage();
else{
  try{
    for(const arg of args){
      const match=/^--(out|pares)=(.{1,250})$/.exec(arg);
      if(!match||Object.hasOwn(options,match[1]))
        throw Error('V001 argumento desconocido o repetido: '+arg);
      options[match[1]]=match[2];
    }
    const archive=JSON.parse(readFileSync(SOURCE+'verificacion.json','utf8'));
    const expectedSummary=JSON.parse(readFileSync(SOURCE+'resumen-original.json','utf8'));
    const b64=readFileSync(SOURCE+'diario.jsonl.gz.b64','utf8').trim();
    need(/^[A-Za-z0-9+/=]+$/.test(b64)&&b64.length<500000,
      'V001 archivo base64 del diario no válido');
    const decoded=gunzipSync(Buffer.from(b64,'base64'),{maxOutputLength:64*1024*1024});
    const actualDigest=hash(decoded);
    need(actualDigest===archive.journal_sha256,
      'V001 hash del diario NO coincide con evidencia original');
    const dir=mkdtempSync(join(tmpdir(),'laplace-v001-'));
    let events;
    try{
      writeFileSync(join(dir,'diario.jsonl'),decoded,{flag:'wx',mode:0o600});
      events=leerDiario(dir); // Checks chained SHA, frozen predictions, real minute outcomes.
    }finally{rmSync(dir,{recursive:true,force:true})}
    const reproduced=resumir(events,expectedSummary.actualizado_en);
    need(isDeepStrictEqual(reproduced,expectedSummary),
      'V001 el resumen archivado NO coincide con el diario revalidado');
    const evalM= evaluarJournalM001(events,{asOf:now});
    need(evalM.emitted===archive.forecasts&&evalM.evaluated===archive.evaluated&&
      events.length===archive.events&&
      evalM.pooled_descriptive_only.direction_hits===archive.direction_hits&&
      evalM.pooled_descriptive_only.price_hits_10bp===archive.price_hits&&
      archive.summary_replayed_exactly===true,
      'V001 resultados prospectivos no cuadran con verificación histórica');
    const world=auditarCapturaMundial(JSON.parse(readFileSync(WORLD,'utf8')));
    const catalog=auditarMatrizFuentes(undefined,{auditedAt:now});
    const ablations=compararAblacionesPareadas(
      options.pares?JSON.parse(readFileSync(options.pares,'utf8')):[],{asOf:now});
    const findings={
      m001:{eventos:events.length,hash_sha256:actualDigest,
        summary_matches_archive:true,
        evaluation:evalM,
        archive_verified_at:archive.audited_at,
        evidence_origin:'archived_prospective_local_journal_2026_10_30'},
      u003_historical:world,coverage_inventory:catalog,
      world_price_ablation:ablations,
      source_vintages_for_recent_modules_certified:false,
      independent_holdout_world_improvement_certified:false,
      ready_for_financial_trading:false
    };
    const gate={
      implementation_and_test_plan_complete:true,
      source_inputs_influence_center_price:false,
      automated_trading_allowed:false,
      activate_world_price_predictor:false,
      statistical_advantage_certified:false,
      global_data_complete:false,
      blocker_codes:[
        'NO_PAIRED_FROZEN_WORLD_FORECASTS',
        'M001_OUTCOMES_INSUFFICIENT_AND_OVERLAPPING',
        'HISTORICAL_VINTAGES_FOR_NEW_SOURCES_MISSING',
        'OTHER_FEED_COVERAGE_AND_LICENCES_PARTIAL'
      ],
      result:'NO_GO_MODEL_PRODUCTION'
    };
    const capture=sellarCaptura({schema:V001_SCHEMA,run_at:now,
      source_evidence_hashes:{
        m001_diario_sha256:actualDigest,
        m001_resumen_sha256:huellaContenido(expectedSummary),
        u003_snapshot_sha256:world.snapshot_sha256
      },...findings,gate,
      note:'El cierre V001 es una auditoría de software. No certifica precisión financiera ni acceso a información privada.'});
    const summary={schema:V001_SCHEMA,run_at:now,
      m001_forecasts:evalM.emitted,m001_evaluated:evalM.evaluated,
      m001_direction_hits:evalM.pooled_descriptive_only.direction_hits,
      m001_price_hits_10bp:evalM.pooled_descriptive_only.price_hits_10bp,
      m001_mae_usd:evalM.pooled_descriptive_only.mae_usd,
      persistence_mae_usd:evalM.pooled_descriptive_only.persistence_mae_usd,
      m001_mae_skill_vs_persistence:evalM.pooled_descriptive_only.mae_skill_vs_persistence,
      world_snapshot_states:world.known_states,
      no_prospective_world_ablation:ablations.status==='no_frozen_world_forecasts',
      gate:gate.result,hash:capture.capture_sha256};
    if(options.out){
      mkdirSync(dirname(options.out),{recursive:true,mode:0o700});
      writeFileSync(options.out,JSON.stringify(capture,null,2)+'\n',{flag:'wx',mode:0o600});
      summary.file=options.out;
    }
    console.log(JSON.stringify(summary,null,2));
  }catch(error){
    console.error('V001 validación detenida: '+String(error.message));
    process.exitCode=1;
  }
}
