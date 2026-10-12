import fs from 'node:fs/promises';
// Keep a bounded recent tail without changing the app's append-only descriptor.
export async function pruneLog(file,maxBytes=256*1024){
  let handle;
  try{handle=await fs.open(file,'r+');}catch(error){if(error.code==='ENOENT')return 0;throw error;}
  try{
    const {size}=await handle.stat();if(size<=maxBytes)return size;
    const tail=Buffer.alloc(maxBytes);
    await handle.read(tail,0,maxBytes,size-maxBytes);
    await handle.write(tail,0,maxBytes,0);await handle.truncate(maxBytes);
    return maxBytes;
  }finally{await handle.close();}
}
