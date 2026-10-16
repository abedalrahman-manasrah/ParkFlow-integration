import type { AuthSession } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { AppError,type AppErrorCode } from '@/utils/errors';
import { secureStorage } from '../storage';
export const API_BASE_URL=process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/,'');
let refreshing:Promise<AuthSession>|undefined;
interface Options {method?:string;body?:unknown;key?:string;public?:boolean;form?:FormData;retry?:boolean}
const codes:Record<string,AppErrorCode>={UNAUTHORIZED:'unauthorized',NOT_FOUND:'not_found',INSUFFICIENT_FUNDS:'insufficient_funds',PAYMENT_FAILED:'payment_failed',VALIDATION:'validation'};
export async function refreshSession():Promise<AuthSession>{
 if(refreshing)return refreshing;
 const previous=useAuthStore.getState().session;
 if(!previous)throw new AppError('unauthorized','Sign in to continue');
 refreshing=(async()=>{try{
 const next=await api<AuthSession>('/auth/refresh',{method:'POST',body:{refreshToken:previous.refreshToken},public:true});
 const state=useAuthStore.getState();if(state.session?.refreshToken!==previous.refreshToken)throw new AppError('unauthorized','Session changed');
 await state.signIn(next,state.user!);return next;
 }catch(e){if(e instanceof AppError&&e.code==='unauthorized')await useAuthStore.getState().signOut();throw e;}finally{refreshing=undefined;}})();
 return refreshing;
}
export async function api<T>(path:string,options:Options={}):Promise<T>{
 if(!API_BASE_URL)throw new AppError('network','Set EXPO_PUBLIC_API_BASE_URL to your ParkFlow backend URL.');
 let session=useAuthStore.getState().session;
 if(!options.public&&session&&Date.parse(session.expiresAt)<=Date.now()+30000){session=await refreshSession();}
 let response:Response;
 try{response=await fetch(API_BASE_URL+path,{method:options.method??'GET',headers:{...(!options.form?{'Content-Type':'application/json'}:{}),...(!options.public&&session?{Authorization:`Bearer ${session.accessToken}`} :{}),...(options.key?{'Idempotency-Key':options.key}:{})},body:options.form??(options.body===undefined?undefined:JSON.stringify(options.body)),signal:AbortSignal.timeout(15000)});}catch{throw new AppError('network','Could not reach the ParkFlow backend');}
 if(response.status===401&&!options.public&&options.retry!==false&&session){await refreshSession();return api<T>(path,{...options,retry:false});}
 const data=await response.json().catch(()=>null) as {error?:{code:string;message:string;details?:Record<string,unknown>}}|null;
 if(!response.ok||data?.error){const code=data?.error?.code??'UNKNOWN';throw new AppError(codes[code]??(response.status===409?'conflict':response.status===400?'validation':'unknown'),data?.error?.message??'The request failed',{...data?.error?.details,serverCode:code,status:response.status});}
 return data as T;
}
export function query(params:Record<string,unknown>){const entries=Object.entries(params).filter(([,v])=>v!==undefined&&v!==null);return entries.length?'?'+entries.map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&'):'';}
export const segment=(s:string)=>encodeURIComponent(s);
// Persist only a request key, never authoritative business state. Retries after app restarts
// reuse the same key if the previous response was lost.
const pending=new Map<string,Promise<unknown>>();
export function mutation<T>(path:string,body:unknown={}):Promise<T>{
 const scope=(useAuthStore.getState().session?.userId??'anonymous')+path+JSON.stringify(body);
 const existing=pending.get(scope);if(existing)return existing as Promise<T>;
 const storageKey='pf_request_'+Array.from(scope).map(c=>c.charCodeAt(0).toString(16)).join('_');
 const request=(async()=>{let key=await secureStorage.getItem(storageKey);if(!key){key=`request-${Date.now()}-${Math.random().toString(36).slice(2)}`;await secureStorage.setItem(storageKey,key);}try{const result=await api<T>(path,{method:'POST',body,key});await secureStorage.removeItem(storageKey);return result;}catch(e){if(e instanceof AppError&&e.code!=='network'&&Number(e.details?.status??500)<500)await secureStorage.removeItem(storageKey);throw e;}finally{pending.delete(scope);}})();
 pending.set(scope,request);return request;
}
