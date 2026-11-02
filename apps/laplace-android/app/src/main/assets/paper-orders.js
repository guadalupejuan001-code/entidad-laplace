/* Cuenta virtual: cantidades 1e-8 y dinero en centavos con BigInt. */
(function(root){
'use strict';
const UNIT=100000000n,need=(x,m)=>{if(!x)throw Error(m)};
function units(value){const s=String(value);need(/^\d{1,15}(\.\d{1,8})?$/.test(s),'Usa un decimal positivo de hasta 8 posiciones');
 const [a,b='']=s.split('.');const n=BigInt(a)*UNIT+BigInt((b+'00000000').slice(0,8));need(n>0n,'Cantidad positiva requerida');return n}
const text=n=>{const negative=n<0n;if(negative)n=-n;const a=n/UNIT,b=(n%UNIT).toString().padStart(8,'0').replace(/0+$/,'');return (negative?'-':'')+a+(b?'.'+b:'')};
const centsText=n=>{const negative=n<0n;if(negative)n=-n;return(negative?'-':'')+(n/100n)+'.'+(n%100n).toString().padStart(2,'0')};
function create(balance='10000'){const value=units(balance);return {schema:'laplace-paper-orders-v1',
 cashCents:String(value/1000000n),positions:{},orders:[],realizedCents:'0',simulated:true}}
function quoteValid(q,now){return q&&typeof q.asset==='string'&&Number.isFinite(q.price)&&q.price>0&&
 Number.isFinite(q.receivedAt)&&Math.abs(now-q.receivedAt)<=180000&&
 Number.isFinite(Date.parse(q.time))&&Math.abs(now-Date.parse(q.time))<=180000}
function place(account,order,{allowedAssets}={}){
 need(account?.schema==='laplace-paper-orders-v1','Cuenta virtual inválida');
 need(Array.isArray(allowedAssets)&&allowedAssets.includes(order.asset),'Activo no disponible');
 need(order.side==='buy'||order.side==='sell','Lado inválido');need(['market','limit'].includes(order.type),'Tipo inválido');
 need(typeof order.id==='string'&&!account.orders.some(x=>x.id===order.id),'Identificador repetido');
 need(Number.isFinite(order.createdAt),'Falta hora de emisión');units(order.quantity);if(order.type==='limit')units(order.limitPrice);
 return {...account,orders:[...account.orders,{...order,status:'pending',simulated:true}]};
}
function process(account,quote,{now=Date.now()}={}){
 if(!quoteValid(quote,now)||!account.orders.some(o=>o.status==='pending'&&o.asset===quote.asset))return account;
 let changed=false;
 let next={...account,positions:structuredClone(account.positions),orders:account.orders.map(x=>({...x}))};
 for(const order of next.orders){
  if(order.status!=='pending'||order.asset!==quote.asset||quote.receivedAt<order.createdAt)continue;
  const price=units(quote.price.toFixed(8)),quantity=units(order.quantity);
  if(order.type==='limit'){
   const limit=units(order.limitPrice);if(order.side==='buy'?price>limit:price<limit)continue;
  }
  const raw=price*quantity,denom=100000000000000n;
  const amount=order.side==='buy'?(raw+denom-1n)/denom:raw/denom;
  if(amount<=0n){changed=true;order.status='rejected';order.reason='Importe inferior a un centavo';continue}
  let cash=BigInt(next.cashCents);const pos=next.positions[order.asset]??{quantityUnits:'0',costCents:'0'};
  const held=BigInt(pos.quantityUnits),cost=BigInt(pos.costCents);
  if(order.side==='buy'){
   if(amount>cash){changed=true;order.status='rejected';order.reason='Saldo virtual insuficiente';continue}
   next.cashCents=String(cash-amount);next.positions[order.asset]={quantityUnits:String(held+quantity),costCents:String(cost+amount)};
  }else{
   if(quantity>held){changed=true;order.status='rejected';order.reason='Posición virtual insuficiente';continue}
   const basis=quantity===held?cost:cost*quantity/held;
   const realized=amount-basis;next.cashCents=String(cash+amount);next.realizedCents=String(BigInt(next.realizedCents)+realized);
   next.positions[order.asset]={quantityUnits:String(held-quantity),costCents:String(cost-basis)};
   order.realizedCents=String(realized);
  }
  changed=true;Object.assign(order,{status:'filled',fillPrice:quote.price,filledAt:now,amountCents:String(amount),
   referenceSource:quote.source??'Cotización pública',quoteTime:quote.time,
   note:'Ejecución simulada al precio de referencia. Sin spread, comisión ni garantía de ejecución real.'});
 }
 return changed?next:account;
}
function cancel(account,id){return {...account,orders:account.orders.map(o=>o.id===id&&o.status==='pending'?{...o,status:'canceled'}:o)}}
const api={units,quantityText:text,moneyText:centsText,create,place,process,cancel,quoteValid};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.LaplacePaperOrders=api;
})(typeof window!=='undefined'?window:globalThis);
