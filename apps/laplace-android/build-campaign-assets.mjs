import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('.',import.meta.url)),assets=base+'app/src/main/assets/';
const hash=x=>createHash('sha256').update(x).digest('hex');
const kernel=hash(Buffer.concat([readFileSync(base+'app/src/main/cpp/laplace_temporal.hpp'),Buffer.from('\n'),readFileSync(base+'app/src/main/cpp/laplace_campaign.hpp')]));
const template=hash(readFileSync(assets+'lqc-native.xi'));
const report=JSON.parse(readFileSync(base+'../../evidencia/campana-c02/resultados.json','utf8'));
if(report.kernelSHA256!==kernel)throw Error('Native campaign differs from evaluated models');
const java='package com.entidadlaplace.mobile;\n/** Generated campaign identity. */\npublic final class LQTCampaignBuild {\n'+
` public static final String KERNEL_SHA256="${kernel}";\n public static final String TEMPLATE_SHA256="${template}";\n private LQTCampaignBuild(){}\n}\n`;
const path=base+'app/src/main/java/com/entidadlaplace/mobile/LQTCampaignBuild.java';
if(process.argv.includes('--verify')){if(readFileSync(path,'utf8')!==java)throw Error('Campaign identity differs from native source');}
else writeFileSync(path,java);
