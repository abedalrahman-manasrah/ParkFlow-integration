import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Request } from 'express';
import { redis } from '../database/redis';
import { origins } from '../config/env';
import { authenticateRequest } from '../modules/auth/webSession';
import { ApiError } from '../utils/errors';
import { resolveBrowserOrigin } from '../utils/browserOrigin';
function originRequest(request:IncomingMessage){
 return {method:request.method,get:(name:string)=>{const value=request.headers[name.toLowerCase()];return Array.isArray(value)?value.join(','):value;}};
}

export function attachSockets(server:HttpServer){const io=new Server(server,{cors:{origin:origins,credentials:true},allowRequest:(request,done)=>{try{resolveBrowserOrigin(originRequest(request));done(null,true);}catch{done(null,false);}}});const pub=redis.duplicate(),sub=redis.duplicate();io.adapter(createAdapter(pub,sub));
 io.use(async(socket,next)=>{
  try{
   const handshake=socket.handshake,auth=handshake.auth??{};
   // Engine.IO retains its original GET, which is where a same-origin browser
   // may omit Origin. Resolve that proof before making namespace auth unsafe.
   const initial=originRequest(socket.request),origin=resolveBrowserOrigin(initial);
   const headers:Record<string,string|undefined>={origin:origin??undefined,cookie:initial.get('Cookie')};
   const fields=[['x-parkflow-app','application'],['x-parkflow-session','sessionId'],['x-parkflow-login','loginId'],['x-parkflow-csrf','csrfToken']] as const;
   for(const [name,field] of fields){const value=auth[field];headers[name]=typeof value==='string'?value:undefined;}
   if(origin===null){
    if(fields.some(([,field])=>auth[field]!==undefined))throw new ApiError(403,'FORBIDDEN','Browser socket proof requires a trusted Origin');
    if(typeof auth.token==='string')headers.authorization='Bearer '+auth.token;
   }
   // A namespace connection is an unsafe operation even though its first
   // polling request was a GET: retain session/login identity and CSRF checks.
   const request={method:'POST',get:(name:string)=>headers[name.toLowerCase()]} as unknown as Request;
   socket.data.request=request;
   socket.data.auth=await authenticateRequest(request);next();
  }catch(error){next(new Error(error instanceof ApiError?error.code:'UNAUTHORIZED'));}
 });
 io.on('connection',socket=>{const a=socket.data.auth;socket.join(`user:${a.userId}`);socket.join('community');const expiry=setTimeout(()=>socket.disconnect(true),Math.max(1,a.exp*1000-Date.now()));const check=setInterval(()=>{void authenticateRequest(socket.data.request).catch(()=>socket.disconnect(true));},30000);socket.on('disconnect',()=>{clearTimeout(expiry);clearInterval(check);});});
 return {io,close:async()=>{await new Promise<void>(r=>io.close(()=>r()));await pub.quit();await sub.quit();}};
}
