/* Checksummed, segmented, group-commit WAL. ACKs follow fsync, not write(). */
import {open,readFile,mkdir,rename,readdir,stat,truncate,unlink} from 'node:fs/promises';
import {openSync,readSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {hostname} from 'node:os';
import {sha,stable,need} from './contrato.mjs';

const HEADER=36,MAX_FRAME=6*1024*1024;
const segmentName=n=>String(n).padStart(12,'0')+'.wal';
export async function atomicJSON(path,value){
  const tmp=path+'.'+process.pid+'.tmp',f=await open(tmp,'w',0o600);
  try{await f.writeFile(JSON.stringify(value)+'\n');await f.sync()}finally{await f.close()}
  await rename(tmp,path);const d=await open(join(path,'..'),'r');try{await d.sync()}finally{await d.close()}
}
export async function readJSON(path,fallback=null){try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}}
function* scan(path,{allowTail=false}={}){
  const fd=openSync(path,'r');let offset=0;
  try{for(;;){
    const head=Buffer.alloc(HEADER),n=readSync(fd,head,0,HEADER,offset);
    if(!n)return {validBytes:offset,torn:false};
    if(n<HEADER){need(allowTail,'incomplete WAL header in closed segment');return {validBytes:offset,torn:true}}
    const size=head.readUInt32BE();need(size>0&&size<=MAX_FRAME,'WAL length corruption at '+offset);
    const body=Buffer.alloc(size),read=readSync(fd,body,0,size,offset+HEADER);
    if(read<size){need(allowTail,'incomplete WAL frame in closed segment');return {validBytes:offset,torn:true}}
    need(sha(body)===head.subarray(4).toString('hex'),'WAL checksum corruption at '+offset);
    let record;try{record=JSON.parse(body.toString())}catch{throw Error('WAL JSON corruption at '+offset)}
    need(Number.isSafeInteger(record.seq)&&record.seq>0,'invalid WAL sequence');
    yield record;offset+=HEADER+size;
  }}finally{closeSync(fd)}
}
export class Journal{
  constructor(directory,{segmentBytes=32*1024*1024,maxBytes=4*1024*1024*1024,maxQueuedBytes=32*1024*1024,commitMs=3}={}){
    this.directory=directory;this.segmentBytes=segmentBytes;this.maxBytes=maxBytes;this.maxQueuedBytes=maxQueuedBytes;
    this.commitMs=commitMs;this.queue=[];this.queuedBytes=0;this.bytes=0;this.seq=0;this.closed=false;this.fatal=null;
  }
  async open(){
    await mkdir(this.directory,{recursive:true});this.lockPath=join(this.directory,'writer.lock');
    try{this.lock=await open(this.lockPath,'wx',0o600)}catch(e){
      if(e.code!=='EEXIST')throw e;
      const owner=await readJSON(this.lockPath);let dead=false;
      if(owner?.host===hostname()&&Number.isInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0)}catch(error){dead=error.code==='ESRCH'}}
      need(dead,'WAL writer locked; cannot establish that the previous writer stopped');
      await rename(this.lockPath,join(this.directory,'writer.stale.'+Date.now()+'.json'));
      this.lock=await open(this.lockPath,'wx',0o600);
    }
    await this.lock.writeFile(stable({pid:process.pid,host:hostname(),started_at:new Date().toISOString()}));await this.lock.sync();
    try{
      this.names=(await readdir(this.directory)).filter(x=>/^\d{12}\.wal$/.test(x)).sort();
      this.archivedThrough=(await readJSON(join(this.directory,'retention.json'),{archived_through:0})).archived_through;
      let last=this.archivedThrough;
      for(let i=0;i<this.names.length;i++){
        const path=join(this.directory,this.names[i]),it=scan(path,{allowTail:i===this.names.length-1});let next;
        while(!(next=it.next()).done){if(next.value.seq<=this.archivedThrough)continue;need(next.value.seq===last+1,'non-contiguous WAL sequence');last=next.value.seq}
        if(next.value.torn)await truncate(path,next.value.validBytes);
        this.bytes+=(await stat(path)).size;
      }
      this.seq=last;this.durableSeq=last;this.segment=this.names.length?Number(this.names.at(-1).slice(0,12)):1;
      if(!this.names.length)this.names.push(segmentName(this.segment));
      this.file=await open(join(this.directory,this.names.at(-1)),'a+',0o600);
      this.currentBytes=(await this.file.stat()).size;return this;
    }catch(e){await this.lock.close();await unlink(this.lockPath);throw e}
  }
  append(value){
    if(this.closed||this.fatal)return Promise.reject(this.fatal??Error('WAL closed'));
    const estimate=Buffer.byteLength(stable(value))+128;
    if(estimate>MAX_FRAME||this.queuedBytes+estimate>this.maxQueuedBytes||this.bytes+this.queuedBytes+estimate>this.maxBytes)
      return Promise.reject(Object.assign(Error('WAL capacity reached; retry after recovery/drain'),{code:'INPUT_BACKPRESSURE'}));
    return new Promise((resolve,reject)=>{
      this.queue.push({value,estimate,resolve,reject});this.queuedBytes+=estimate;
      if(!this.timer&&!this.flushing)this.timer=setTimeout(()=>{this.timer=null;void this.flush()},this.commitMs);
    });
  }
  async flush(){
    if(this.flushing)return this.flushing;
    this.flushing=(async()=>{
      while(this.queue.length){
        const batch=this.queue.splice(0,256);let pending=[],pieces=[];
        const writePieces=async()=>{
          if(!pieces.length)return;const chunk=Buffer.concat(pieces);pieces=[];
          let offset=0;while(offset<chunk.length){const r=await this.file.write(chunk,offset,chunk.length-offset,null);need(r.bytesWritten>0,'short WAL write');offset+=r.bytesWritten}
        };
        try{
          for(const item of batch){
            const record={...item.value,seq:++this.seq},body=Buffer.from(stable(record));
            need(body.length<=MAX_FRAME,'WAL frame exceeds limit');
            const head=Buffer.alloc(HEADER);head.writeUInt32BE(body.length);Buffer.from(sha(body),'hex').copy(head,4);
            const frame=Buffer.concat([head,body]);
            if(this.currentBytes&&this.currentBytes+frame.length>this.segmentBytes){
              await writePieces();await this.file.sync();await this.file.close();this.segment++;const name=segmentName(this.segment);this.names.push(name);
              this.file=await open(join(this.directory,name),'ax+',0o600);this.currentBytes=0;
            }
            pieces.push(frame);
            this.currentBytes+=frame.length;this.bytes+=frame.length;pending.push([item,record]);
          }
          await writePieces();await this.file.sync();
          // Directory entries for newly created segments must survive the same crash model.
          const dir=await open(this.directory,'r');try{await dir.sync()}finally{await dir.close()}
          this.durableSeq=pending.at(-1)[1].seq;
          for(const [item,record] of pending){this.queuedBytes-=item.estimate;item.resolve(record)}
        }catch(error){
          this.fatal=error;for(const item of [...batch,...this.queue.splice(0)])item.reject(error);this.queuedBytes=0;throw error;
        }
      }
    })();
    try{await this.flushing}catch(error){this.fatal=error}finally{
      this.flushing=null;
      // A resolved append may enqueue again before this finally block runs.
      if(this.queue.length&&!this.fatal&&!this.timer)this.timer=setTimeout(()=>{this.timer=null;void this.flush()},this.commitMs);
    }
  }
  *records(after=0){
    need(after>=this.archivedThrough,'requested WAL history expired; replay from the replicated raw log/archive');
    for(const name of this.names)for(const record of scan(join(this.directory,name),{allowTail:true}))if(record.seq>after&&record.seq<=this.durableSeq)yield record;
  }
  async prune(acknowledged,{retainMs=86400000,now=Date.now()}={}){
    // Only a fully acknowledged prefix of closed segments is eligible.
    let through=this.archivedThrough;const remove=[];
    for(const name of this.names.slice(0,-1)){
      const path=join(this.directory,name),info=await stat(path);if(now-info.mtimeMs<retainMs)break;
      let last=through;for(const r of scan(path))last=r.seq;if(last>acknowledged)break;
      through=last;remove.push({name,path,bytes:info.size});
    }
    if(!remove.length)return 0;
    await atomicJSON(join(this.directory,'retention.json'),{archived_through:through});this.archivedThrough=through;
    for(const entry of remove){await unlink(entry.path);this.bytes-=entry.bytes;this.names=this.names.filter(n=>n!==entry.name)}
    return remove.length;
  }
  async checkpoint(name,value){need(/^[a-z0-9_-]{1,80}$/.test(name),'invalid checkpoint name');await atomicJSON(join(this.directory,name+'.json'),value)}
  async cursor(name){return readJSON(join(this.directory,name+'.json'),{seq:0})}
  async close(){
    this.closed=true;if(this.timer){clearTimeout(this.timer);this.timer=null}
    do{await this.flush()}while(this.queue.length&&!this.fatal);
    if(this.timer){clearTimeout(this.timer);this.timer=null}
    if(this.file)await this.file.close();if(this.lock){await this.lock.close();await unlink(this.lockPath);this.lock=null}
  }
}
