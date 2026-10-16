import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import { redis } from '../database/redis';
import { origins } from '../config/env';
import { authenticate } from '../modules/auth/service';
export function attachSockets(server:HttpServer){const io=new Server(server,{cors:{origin:origins}});const pub=redis.duplicate(),sub=redis.duplicate();io.adapter(createAdapter(pub,sub));
 io.use(async(socket,next)=>{try{socket.data.auth=await authenticate(String(socket.handshake.auth.token??''));next();}catch{next(new Error('UNAUTHORIZED'));}});
 io.on('connection',socket=>{const a=socket.data.auth;socket.join(`user:${a.userId}`);socket.join('community');const expiry=setTimeout(()=>socket.disconnect(true),Math.max(1,a.exp*1000-Date.now()));const check=setInterval(()=>{void authenticate(String(socket.handshake.auth.token)).catch(()=>socket.disconnect(true));},30000);socket.on('disconnect',()=>{clearTimeout(expiry);clearInterval(check);});});
 return {io,close:async()=>{await new Promise<void>(r=>io.close(()=>r()));await pub.quit();await sub.quit();}};
}
