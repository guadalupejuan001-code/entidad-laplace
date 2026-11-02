const test=require('node:test'),assert=require('node:assert/strict'),P=require('../app/src/main/assets/paper-orders.js');
const NOW=Date.parse('2026-11-02T00:00:00Z'),q=(price,extra={})=>({asset:'BTC-USD',price,receivedAt:NOW+1,time:new Date(NOW).toISOString(),source:'FIXTURE SIMULADA',...extra});
const add=(a,extra={})=>P.place(a,{id:'o1',asset:'BTC-USD',side:'buy',type:'market',quantity:'1',createdAt:NOW,...extra},{allowedAssets:['BTC-USD']});
test('cuenta virtual compra, vende y mide resultado sin modificar el original',()=>{
 const original=P.create('10000'),bought=P.process(add(original),q(100),{now:NOW+5});
 assert.equal(original.cashCents,'1000000');assert.equal(bought.cashCents,'990000');
 assert.equal(bought.positions['BTC-USD'].quantityUnits,'100000000');
 const sold=P.process(add(bought,{id:'o2',side:'sell'}),q(110),{now:NOW+5});
 assert.equal(sold.cashCents,'1001000');assert.equal(sold.realizedCents,'1000');
 assert.equal(sold.orders[1].simulated,true);
});
test('rechaza saldo y posición insuficientes sin crear deuda virtual',()=>{
 assert.equal(P.process(add(P.create('10')),q(100),{now:NOW+5}).orders[0].status,'rejected');
 const x=P.process(add(P.create(),{side:'sell'}),q(100),{now:NOW+5});assert.equal(x.orders[0].status,'rejected');assert.equal(x.realizedCents,'0');
});
test('límite espera su precio; cancelar no revierte una operación ejecutada',()=>{
 let a=add(P.create(),{type:'limit',limitPrice:'90'});a=P.process(a,q(100),{now:NOW+5});assert.equal(a.orders[0].status,'pending');
 const canceled=P.cancel(a,'o1');assert.equal(canceled.orders[0].status,'canceled');
 a=P.process(a,q(89),{now:NOW+5});assert.equal(a.orders[0].status,'filled');assert.equal(P.cancel(a,'o1').orders[0].status,'filled');
});
test('no ejecuta con cotización vieja, otro activo o recibida antes de la orden',()=>{
 const a=add(P.create());for(const quote of [q(100,{receivedAt:NOW-1}),q(100,{asset:'ETH-USD'}),q(100,{time:new Date(NOW-200000).toISOString()})])assert.equal(P.process(a,quote,{now:NOW+5}).orders[0].status,'pending');
});
test('contabilidad de centavos no crea dinero al redondear fracciones',()=>{
 const a=P.process(add(P.create('1'),{quantity:'0.1'}),q(1.23),{now:NOW+5});assert.equal(a.cashCents,'87');
 const b=P.process(add(a,{id:'sell',quantity:'0.1',side:'sell'}),q(1.23),{now:NOW+5});assert.equal(b.cashCents,'99');assert.equal(b.realizedCents,'-1');
});
test('identificadores repetidos, cantidades negativas y símbolos desconocidos se rechazan',()=>{
 const a=add(P.create());assert.throws(()=>add(a),/repetido/);assert.throws(()=>add(P.create(),{quantity:'-1'}),/decimal/);
 assert.throws(()=>add(P.create(),{asset:'UNKNOWN'}),/Activo/);
});
