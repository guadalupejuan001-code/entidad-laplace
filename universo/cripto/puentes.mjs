/* K001 bridge ledger: deterministic pairing of already verified PUBLIC events.
 * Pure module only: NO bridge RPC, addresses or account graph are connected.
 * Both legs of a bridge are the same transfer, not two capital inflows.
 */
import {createHash} from 'node:crypto';
import {utcTime} from '../estados.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const columns=['asset','chain','decimals','event','finality','known_at',
  'message_id','quantity_raw','source','observed_at'].sort().join('|');
const EVENTS=['lock','mint','burn','release'];
function id(s){return createHash('sha256').update(s).digest('hex').slice(0,24)}
export function reconcileBridgePairs(raw,{cutoff}={}){
  const at=utcTime(cutoff);
  need(Array.isArray(raw)&&raw.length<=128,'bridge ledger limit 128 events');
  const messages=new Map(),seen=new Set(),pending=[];
  for(const event of raw){
    need(event&&typeof event==='object'&&!Array.isArray(event)&&
      Object.keys(event).sort().join('|')===columns,
      'bridge event has missing/confidential fields');
    need(typeof event.message_id==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(event.message_id),
      'bridge message id invalid');
    need(['bitcoin','ethereum','arbitrum','base'].includes(event.chain)&&
      ['USDC','USDT'].includes(event.asset)&&EVENTS.includes(event.event),
      'bridge network/token/event out of allowlist');
    need(event.finality==='provider_finalized'&&
      typeof event.source==='string'&&event.source.startsWith('https://')&&
      event.source.length<=250,'bridge provenance/finality not declared');
    need(Number.isInteger(event.decimals)&&event.decimals>=0&&event.decimals<=18&&
      typeof event.quantity_raw==='string'&&/^[1-9]\d{0,39}$/.test(event.quantity_raw),
      'bridge quantity/decimals invalid');
    const known=utcTime(event.known_at),observed=utcTime(event.observed_at);
    need(observed<=known&&known<=at,'bridge event unknown at requested cutoff');
    const key=id(event.message_id+'|'+event.chain+'|'+event.event);
    need(!seen.has(key),'bridge duplicate chain/event/message');seen.add(key);
    const group=messages.get(event.message_id)??[];
    group.push(event);messages.set(event.message_id,group);
  }
  const paired=[];
  for(const [msg,items] of messages){
    if(items.length!==2){pending.push({public_message_hash:id(msg),
      reason:'missing_or_ambiguous_leg'});continue}
    const [a,b]=items;
    const pair=(
      a.event==='lock'&&b.event==='mint'||
      a.event==='burn'&&b.event==='release'||
      b.event==='lock'&&a.event==='mint'||
      b.event==='burn'&&a.event==='release'
    );
    if(!pair||a.chain===b.chain||a.asset!==b.asset||a.decimals!==b.decimals||
      a.quantity_raw!==b.quantity_raw){
      pending.push({public_message_hash:id(msg),reason:'legs_not_consistent'});
      continue;
    }
    paired.push({public_message_hash:id(msg),
      source_chain:['lock','burn'].includes(a.event)?a.chain:b.chain,
      destination_chain:['mint','release'].includes(a.event)?a.chain:b.chain,
      asset:a.asset,raw_quantity:a.quantity_raw,decimals:a.decimals,
      semantics:'cross_chain_relocation_not_new_global_supply',
      counterparty_identity_known:false,
      proof_verified_by_k001:false});
  }
  return {paired,pending,event_count:raw.length,
    matched_messages:paired.length,
    paired_leg_count:paired.length*2,
    inferred_capital_creation:0,
    actual_global_mint_burn_reported:false,
    message_labels_independently_verified:false,
    transaction_addresses_retained:false,
    bridge_double_counting_prevented:true,
    live_bridge_feed_connected:false,
    prediction_inputs_enabled:false,automatic_trading:false};
}
