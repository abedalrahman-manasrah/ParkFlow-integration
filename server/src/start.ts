// Single-container entry for hosts that run one process (e.g. Render Free): migrate, then run API and worker side by side.
// Local Docker Compose keeps its separate backend and worker services and does not use this file.
import { spawn,type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
const prismaCli=resolve(__dirname,'../../node_modules/prisma/build/index.js');
const children=new Map<ChildProcess,string>();
let stopping=false,exitCode=0;
function run(name:string,script:string,args:string[]=[]){const child=spawn(process.execPath,[script,...args],{stdio:'inherit',env:process.env});children.set(child,name);child.once('error',()=>{children.delete(child);console.error(`[start] ${name} could not start; stopping the container`);stop(1);});return child;}
function stop(code:number){
 if(stopping)return;stopping=true;exitCode=code;
 for(const child of children.keys())child.kill('SIGTERM');
 // Render waits 30 s after SIGTERM before killing the container; finish first.
 setTimeout(()=>{for(const child of children.keys())child.kill('SIGKILL');process.exit(exitCode);},25000).unref();
 if(!children.size)process.exit(exitCode);
}
function migrate(){return new Promise<void>((done,fail)=>{const child=run('migrate',prismaCli,['migrate','deploy']);
 child.on('exit',(code,signal)=>{children.delete(child);if(stopping)process.exit(exitCode);if(code===0)done();else fail(new Error(`prisma migrate deploy failed (${signal??code})`));});});}
function supervise(name:string,script:string){const child=run(name,resolve(__dirname,script));
 child.on('exit',(code,signal)=>{children.delete(child);
  if(!stopping){console.error(`[start] ${name} exited (${signal??code}); stopping the container`);stop(1);}
  else if(!children.size)process.exit(exitCode);});}
process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
void migrate().then(()=>{if(stopping)return;supervise('api','server.js');supervise('worker','jobs/worker.js');}).catch(err=>{console.error('[start]',err.message);process.exit(1);});
