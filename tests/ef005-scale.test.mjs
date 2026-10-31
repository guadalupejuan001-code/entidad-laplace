import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../input/almacen.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {importarU003,consultarCorte,consultarPaginaCorte} from '../estado-financiero/repositorio.mjs';
const when='2026-10-31T15:00:00.000Z';
test('EF005: 4101 estados U003 se conservan completos en SQL y XI se divide en lotes',async()=>{
  const db=await Store.open({embeddedDirectory:'memory://'});
  try{
    await db.migrate();
    const states=Array.from({length:4101},(_,i)=>({
      id:'signal-'+i,domain:'mercado_global',variable:'asset_'+i,
      value:100+i,unit:'USD',known_at:when,observed_at:when,
      source_url:'https://example.org/public'}));
    const capture=sellarCaptura({schema:'laplace-universo-global-u003-v4',at:when,
      universal_state:universeSnapshot(states,{cutoff:when}),source_status:[],
      coverage:{known_signals:states.length},automatic_trading:false});
    const first=await importarU003(db,capture);
    assert.equal(first.added_observations,4101);
    const all=await consultarCorte(db,{asOf:when});
    assert.equal(all.known_series,4101);
    const page=await consultarPaginaCorte(db,{asOf:when,limit:2048});
    assert.equal(page.states.length,2048);
    assert.equal(page.next_offset,2048);
    const stored=(await db.db.query('SELECT state_count FROM laplace_fin_captures')).rows[0];
    assert.equal(Number(stored.state_count),4101);
    const again=await importarU003(db,capture);
    assert.equal(again.added_observations,0);
  }finally{await db.close()}
});
