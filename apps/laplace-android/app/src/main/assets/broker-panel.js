(function(){
'use strict';
const $=id=>document.getElementById(id),P=window.LaplacePaperOrders;
const pending=new Map();let sequence=0,prepared=null,configured=false,brokerOrders=[],nextCursor=null,paper=P.create();
const KEY='laplace-paper-account-v1';
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.schema==='laplace-paper-orders-v1')paper=saved}catch(error){}
function status(text){$('brokerStatus').textContent=text}
function command(action,payload={}){return new Promise((resolve,reject)=>{
 if(!window.LaplaceBridge?.brokerCommand){reject(Error('Esta operación requiere la APK Android con el conector Robinhood'));return}
 const id='broker-'+(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('No llegó confirmación de Robinhood. Consulta su estado antes de repetir una orden.'))},180000);
 pending.set(id,{resolve,reject,timer});try{window.LaplaceBridge.brokerCommand(id,action,JSON.stringify(payload))}
 catch(error){clearTimeout(timer);pending.delete(id);reject(error)}
})}
function state(){return {available:typeof window.LaplaceBridge?.brokerCommand==='function',configured,paperOrders:paper.orders.length,manual:true,automatic:false}}
window.LaplaceBroker={state,receive(id,response){const p=pending.get(id);if(!p)return;pending.delete(id);clearTimeout(p.timer);
 response?.ok?p.resolve(response.result):p.reject(Error(response?.error??'Robinhood no disponible'));},quote(q){
 const changed=P.process(paper,q);if(changed!==paper){paper=changed;savePaper();renderPaper()}
}};
function notify(){window.dispatchEvent(new Event('laplace:broker'))}
function savePaper(){try{localStorage.setItem(KEY,JSON.stringify(paper))}catch(error){$('paperStatus').textContent='No se pudo guardar la cuenta virtual. Exporta antes de cerrar.'}notify()}
function make(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e}
function renderPaper(){
 $('paperCash').textContent='USD '+P.moneyText(BigInt(paper.cashCents));
 $('paperRealized').textContent='USD '+P.moneyText(BigInt(paper.realizedCents));
 const list=$('paperHistory');list.replaceChildren();
 for(const o of paper.orders.slice().reverse()){
  const row=make('div','','signal-row'),left=make('div','');
  left.append(make('strong',(o.side==='buy'?'Compra':'Venta')+' '+o.quantity+' '+o.asset),
   make('small',o.status==='filled'?'SIMULADA · USD '+o.fillPrice+' · '+new Date(o.filledAt).toLocaleString()+
    (o.realizedCents?' · resultado realizado USD '+P.moneyText(BigInt(o.realizedCents)):''):
     o.status+(o.reason?' · '+o.reason:'')));
  row.append(left);if(o.status==='pending'){const cancel=make('button','Cancelar');cancel.type='button';cancel.addEventListener('click',()=>{paper=P.cancel(paper,o.id);savePaper();renderPaper()});row.append(cancel)}list.append(row);
 }
 if(!paper.orders.length)list.append(make('p','Aún no hay órdenes simuladas.'));
 const holdings=$('paperPositions');holdings.replaceChildren();
 for(const [asset,p] of Object.entries(paper.positions))if(BigInt(p.quantityUnits)>0n){
  const row=make('div','','signal-row');row.append(make('strong',asset),make('small',P.quantityText(BigInt(p.quantityUnits))+' unidades · coste USD '+P.moneyText(BigInt(p.costCents))));holdings.append(row);
 }
}
function form(real=false){const asset=$('orderAsset').value,side=$('orderSide').value,type=$('orderType').value,
 quantity=$('orderQuantity').value.trim(),limitPrice=$('orderLimitPrice').value.trim();
 if(real){const valid=s=>/^\d{1,18}(\.\d{1,18})?$/.test(s)&&Number(s)>0;
  if(!valid(quantity)||type==='limit'&&!valid(limitPrice))throw Error('Cantidad y precio deben ser decimales positivos');
 }else{P.units(quantity);if(type==='limit')P.units(limitPrice)}
 return {asset,side,type,quantity,limitPrice,
  id:crypto.randomUUID(),createdAt:Date.now(),account_number:$('brokerAccount').value,
  symbol:asset,limit_price:limitPrice,client_order_id:crypto.randomUUID(),forecast_ref:window.LaplaceSelectedForecastMeta?.asset===asset?window.LaplaceSelectedForecastMeta.id:''};
}
function updateMode(){const real=$('orderMode').value==='real';$('paperControls').hidden=real;$('realControls').hidden=!real;
 $('orderModeLabel').textContent=real?'ROBINHOOD · FONDOS REALES':'CUENTA VIRTUAL · SIMULACIÓN';
 $('orderLimitField').hidden=$('orderType').value!=='limit';prepared=null;$('brokerSubmit').disabled=true;$('brokerPreview').replaceChildren();
 $('brokerPrepare').disabled=real&&(!configured||!$('brokerAccount').value||window.LaplaceMarkets.isEquity($('orderAsset').value));
}
$('paperPlace').addEventListener('click',()=>{try{
 const f=form();paper=P.place(paper,f,{allowedAssets:window.LaplaceMarkets.assets});savePaper();renderPaper();
 $('paperStatus').textContent='Orden virtual registrada. Se comprueba con la próxima cotización actualizada de ese activo.';
 window.dispatchEvent(new CustomEvent('laplace:paper-quote-needed',{detail:{asset:f.asset}}));
}catch(error){$('paperStatus').textContent=error.message}});
$('paperExport').addEventListener('click',()=>{
 const raw=JSON.stringify({schema:'laplace-paper-export-v1',exportedAt:new Date().toISOString(),account:paper},null,2);
 if(window.LaplaceBridge?.exportHistory){window.LaplaceBridge.exportHistory(raw);return}
 const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='LAPLACE-cuenta-virtual.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function generate(){try{const r=await command('generate');$('brokerPublicKey').value=r.public_key;status('Copia esta clave pública al crear tu API key en Robinhood. La clave privada permanece cifrada en este teléfono.')}catch(error){status(error.message)}}
$('brokerGenerate').addEventListener('click',generate);
$('brokerSave').addEventListener('click',async()=>{try{const input=$('brokerAPIKey'),key=input.value.trim();
 const r=await command('configure',{api_key:key});input.value='';configured=r.configured;notify();updateMode();
 status('Credencial guardada en el dispositivo. Pulsa Verificar cuenta.');
}catch(error){status(error.message)}});
$('brokerDisconnect').addEventListener('click',async()=>{try{await command('disconnect');configured=false;
 $('brokerAccount').replaceChildren(new Option('Sin cuenta conectada',''));prepared=null;notify();updateMode();status('Conexión retirada de esta app. Puedes revocar la API key también en Robinhood.');
}catch(error){status(error.message)}});
$('brokerConnect').addEventListener('click',async()=>{try{
 status('Verificando la cuenta directamente con Robinhood…');const r=await command('accounts');
 const rows=r.results??[];$('brokerAccount').replaceChildren(new Option('Elige tu cuenta',''));
 for(const a of rows){const option=new Option(a.account_number+' · '+a.status+' · USD '+a.buying_power,a.account_number);option.disabled=a.status!=='active'||!a.is_api_tradable;$('brokerAccount').append(option)}
 if(rows.length===1&&!$('brokerAccount').options[1].disabled)$('brokerAccount').value=rows[0].account_number;
 configured=true;notify();updateMode();status(rows.length?'Cuenta consultada. Las órdenes reales requieren preparación y confirmación nativa.':'Robinhood no devolvió cuentas disponibles.');
}catch(error){status(error.message)}});
$('brokerPrepare').addEventListener('click',async()=>{
 const button=$('brokerPrepare');button.disabled=true;try{
 const f=form(true);status('Comprobando cuenta, incrementos y estimación de ejecución…');const r=await command('prepare',f);
 prepared=r;$('brokerPreview').replaceChildren();
 const q=r.quote;for(const [name,value] of [['Orden',f.side+' '+f.quantity+' '+f.asset],['Tipo',f.type+(f.type==='limit'?' · USD '+f.limitPrice:'')],
  ['Estimación Robinhood',q.est_total_cost??q.est_total_credit??'—'],['Comisión estimada',q.est_fee??'—'],['Cotización',q.timestamp??'—']]){
  const d=make('div','','signal-row');d.append(make('strong',name),make('small',String(value)));$('brokerPreview').append(d);
 }
 $('brokerSubmit').disabled=false;status('Preparación lista. Aún no se ha enviado ninguna orden real.');
}catch(error){prepared=null;$('brokerSubmit').disabled=true;status(error.message)}finally{button.disabled=false}
});
$('brokerSubmit').addEventListener('click',async()=>{
 if(!prepared)return;const draft=prepared;prepared=null;$('brokerSubmit').disabled=true;
 try{status('Revisa el diálogo nativo de confirmación en este teléfono.');const r=await command('submit',{nonce:draft.nonce});
 status(r.canceled_by_user?'Orden cancelada por ti; no se envió.':'Respuesta Robinhood: '+(r.state??'recibida')+' · orden '+(r.id??''));
 if(!r.canceled_by_user)await refreshOrders(false);
 }catch(error){status(error.message)}
});
async function refreshOrders(more=false){try{
 const account=$('brokerAccount').value;if(!account)throw Error('Selecciona una cuenta verificada');
 const r=await command('orders',{account_number:account,cursor:more?nextCursor??'':''});
 if(!more)brokerOrders=[];for(const o of r.results??[])if(!brokerOrders.some(x=>x.id===o.id))brokerOrders.push(o);
 nextCursor=null;if(r.next){const u=new URL(r.next);if(u.origin==='https://trading.robinhood.com')nextCursor=u.searchParams.get('cursor')}
 $('brokerMore').hidden=!nextCursor;renderBrokerOrders();
}catch(error){status(error.message)}}
function renderBrokerOrders(){const list=$('brokerHistory');list.replaceChildren();
 for(const o of brokerOrders){const row=make('div','','signal-row'),left=make('div','');
 left.append(make('strong',o.side+' '+o.symbol+' · '+o.state),make('small','ID '+o.id+' · ejecutado '+(o.filled_asset_quantity??0)+' · precio medio '+(o.average_price??'pendiente')+' · comisión '+(o.fee_charged??'no informada')));row.append(left);
 if(['open','pending','partially_filled'].includes(o.state)){const cancel=make('button','Cancelar orden');cancel.addEventListener('click',async()=>{try{const r=await command('cancel',{order_id:o.id});status(r.canceled_by_user?'Orden conservada.':'Solicitud de cancelación enviada; consulta el estado del bróker.');await refreshOrders()}catch(error){status(error.message)}});row.append(cancel)}list.append(row);
 }if(!brokerOrders.length)list.append(make('p','Robinhood no ha devuelto órdenes en esta consulta.'));
}
$('brokerOrdersRefresh').addEventListener('click',()=>refreshOrders());$('brokerMore').addEventListener('click',()=>refreshOrders(true));
for(const id of ['orderMode','orderType','orderAsset','orderSide','orderQuantity','orderLimitPrice','brokerAccount'])$(id).addEventListener('change',updateMode);
for(const id of ['orderQuantity','orderLimitPrice'])$(id).addEventListener('input',()=>{prepared=null;$('brokerSubmit').disabled=true});
$('orderAsset').replaceChildren(...window.LaplaceMarkets.assets.map(a=>new Option(a,a)));
window.addEventListener('laplace:selection',event=>{$('orderAsset').value=event.detail.asset;updateMode()});
setInterval(()=>{if(document.visibilityState==='visible')for(const asset of new Set(paper.orders.filter(o=>o.status==='pending').map(o=>o.asset)))window.dispatchEvent(new CustomEvent('laplace:paper-quote-needed',{detail:{asset}}));},30000);
renderPaper();updateMode();
(async()=>{try{const r=await command('status');configured=r.configured;$('brokerPublicKey').value=r.public_key??'';notify();updateMode();
 status(configured?'Credencial guardada. Verifica la cuenta para consultar o preparar una orden.':'Configura una API key de Robinhood Crypto para utilizar órdenes reales.');
}catch(error){status(error.message)}})();
})();
