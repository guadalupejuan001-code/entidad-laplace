/* SHA-256 portátil. La API es la mínima usada por el núcleo canónico Node. */
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils';
export function createHash(algorithm){
 if(algorithm!=='sha256')throw Error('Sólo SHA-256 forma parte del contrato móvil');
 const h=sha256.create();
 return {update(value){h.update(typeof value==='string'?utf8ToBytes(value):value);return this},
  digest(encoding){if(encoding!=='hex')throw Error('Formato de hash no admitido');return bytesToHex(h.digest())}};
}
export const randomUUID=()=>globalThis.crypto.randomUUID();
