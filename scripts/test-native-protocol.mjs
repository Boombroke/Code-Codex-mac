// A minimal test-only RFC 6455 peer. It never serves app pages or connects to GPT.
// https://www.rfc-editor.org/rfc/rfc6455.html
import http from 'node:http';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const binary=process.argv[2];
if(!binary)throw Error('Provide the built native manager executable');
const sockets=new Set(),methods=[];
function frame(value,opcode=1){
  const data=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
  assert(data.length<65536);
  const header=Buffer.alloc(data.length<126?2:4);header[0]=0x80|opcode;
  if(data.length<126)header[1]=data.length;else{header[1]=126;header.writeUInt16BE(data.length,2);}
  return Buffer.concat([header,data]);
}
const server=http.createServer((_,response)=>{response.writeHead(404);response.end();});
server.on('upgrade',(request,socket,head)=>{
  assert.equal(request.url,'/mock');sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
  const accept=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  let bytes=head,fragments=[];
  const receive=chunk=>{
    bytes=Buffer.concat([bytes,chunk]);
    while(bytes.length>=2){
      const opcode=bytes[0]&15,final=!!(bytes[0]&0x80),masked=!!(bytes[1]&0x80);let length=bytes[1]&127,offset=2;
      if(length===126){if(bytes.length<4)return;length=bytes.readUInt16BE(2);offset=4;}
      if(length===127){if(bytes.length<10)return;length=Number(bytes.readBigUInt64BE(2));offset=10;}
      assert(length<1024*1024);assert(masked);if(bytes.length<offset+4+length)return;
      const mask=bytes.subarray(offset,offset+4),data=Buffer.from(bytes.subarray(offset+4,offset+4+length));
      bytes=bytes.subarray(offset+4+length);for(let i=0;i<data.length;i++)data[i]^=mask[i%4];
      if(opcode===8){socket.end(frame(data,8));continue;}
      if(opcode===9){socket.write(frame(data,10));continue;}
      if(opcode!==1&&opcode!==0)continue;
      fragments.push(data);if(!final)continue;
      const message=JSON.parse(Buffer.concat(fragments).toString());fragments=[];methods.push(message.method);
      socket.write(frame({method:'Test.event',params:{}})); // Native client must skip unsolicited events.
      if(message.method==='Test.echo'){
        assert.equal(message.params.large.length,4096);
        socket.write(frame({id:message.id,result:{text:message.params.text}}));
      }else if(message.method==='Test.error')socket.write(frame({id:message.id,error:{code:-32000,message:'mock rejection'}}));
      else assert(['Test.hang','Test.timeout'].includes(message.method));
    }
  };
  socket.on('data',receive);socket.on('error',()=>{});if(head.length)receive(Buffer.alloc(0));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
try{
  const child=spawn(binary,[`--protocol-test-url=ws://127.0.0.1:${port}/mock`],{stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>child.kill('SIGTERM'),25000);let output='';
  child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  const exit=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));clearTimeout(timer);
  assert.equal(exit.code,0,output);assert.deepEqual(methods,['Test.echo','Test.error','Test.hang','Test.timeout']);process.stdout.write(output);
}finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
