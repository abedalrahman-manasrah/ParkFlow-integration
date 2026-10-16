import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function harness() {
 const children: Array<EventEmitter & {kill:(signal:string)=>boolean; signals:string[]}> = [];
 const processEvents=new EventEmitter(), exits:number[]=[], timers:Array<()=>void>=[];
 const code=ts.transpileModule(readFileSync(resolve('src/start.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports:{},__dirname:'/app/dist/src',require:(name:string)=>{
  if(name==='node:path')return {resolve};
  if(name==='node:child_process')return {spawn:()=>{const child=Object.assign(new EventEmitter(),{signals:[] as string[],kill(signal:string){this.signals.push(signal);return true;}});children.push(child);return child;}};
  throw Error('Unexpected import '+name);
 },process:{execPath:'/node',env:{},on:processEvents.on.bind(processEvents),exit:(value:number)=>exits.push(value)},console:{error:()=>undefined},setTimeout:(fn:()=>void)=>{timers.push(fn);return {unref(){}};}});
 return {children,exits,timers,signal:()=>processEvents.emit('SIGTERM')};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

describe('single-container cloud supervisor',()=>{
 it('starts API and worker only after migrations succeed',async()=>{const h=harness();expect(h.children).toHaveLength(1);h.children[0]!.emit('exit',0,null);await settle();expect(h.children).toHaveLength(3);expect(h.exits).toEqual([]);});
 it('never starts API or worker when migration fails',async()=>{const h=harness();h.children[0]!.emit('exit',1,null);await settle();expect(h.children).toHaveLength(1);expect(h.exits).toContain(1);});
 it('stops its peer and exits unsuccessfully even when an unexpected child exits with zero',async()=>{const h=harness();h.children[0]!.emit('exit',0,null);await settle();h.children[1]!.emit('exit',0,null);expect(h.children[2]!.signals).toEqual(['SIGTERM']);h.children[2]!.emit('exit',null,'SIGTERM');expect(h.exits).toContain(1);});
 it('handles shutdown during migration without starting services',async()=>{const h=harness();h.signal();expect(h.children[0]!.signals).toEqual(['SIGTERM']);h.children[0]!.emit('exit',null,'SIGTERM');await settle();expect(h.children).toHaveLength(1);expect(h.exits).toContain(0);});
 it('forwards shutdown to both services and exits successfully',async()=>{const h=harness();h.children[0]!.emit('exit',0,null);await settle();h.signal();expect(h.children[1]!.signals).toEqual(['SIGTERM']);expect(h.children[2]!.signals).toEqual(['SIGTERM']);h.children[1]!.emit('exit',0,null);h.children[2]!.emit('exit',0,null);expect(h.exits).toContain(0);});
 it('handles a migration process spawn error without an unhandled event',async()=>{const h=harness();expect(()=>h.children[0]!.emit('error',new Error('fixture spawn failure'))).not.toThrow();await settle();expect(h.children).toHaveLength(1);expect(h.exits).toContain(1);});
 it('stops the API when its worker cannot spawn',async()=>{const h=harness();h.children[0]!.emit('exit',0,null);await settle();expect(()=>h.children[2]!.emit('error',new Error('fixture spawn failure'))).not.toThrow();expect(h.children[1]!.signals).toEqual(['SIGTERM']);h.children[1]!.emit('exit',null,'SIGTERM');expect(h.exits).toContain(1);});
});
