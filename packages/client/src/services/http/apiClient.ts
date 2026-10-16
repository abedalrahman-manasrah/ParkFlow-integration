import type { AuthSession, User, WebAuthSession } from '@parkflow/contracts';
import { useAuthStore,withAuthenticationPersistence } from '../../store/authStore';
import { AppError,type AppErrorCode } from '../../utils/errors';
import { secureStorage } from '../storage';
import { runtimeApiBaseUrl } from '../../runtime/application';
import { bindingOf, bootstrapBrowserSession, isWebSession, sameBrowserLogin, sessionChanged, validateWebSession, webRequestHeaders, webSessionsEnabled, withBrowserAuthLock } from './browserSession';
function configuredBaseUrl() {
 const configured=(runtimeApiBaseUrl??process.env.EXPO_PUBLIC_API_BASE_URL)?.replace(/\/$/,'');
 if(!configured||!webSessionsEnabled||typeof window==='undefined')return configured;
 try {
  const url=new URL(configured),hostname=window.location.hostname;
  // localhost and 127.0.0.1 are different cookie sites. Keep local preview
  // requests on the frontend's host without rewriting deployed API addresses.
  if(['localhost','127.0.0.1'].includes(url.hostname)&&['localhost','127.0.0.1'].includes(hostname))url.hostname=hostname;
  return url.toString().replace(/\/$/,'');
 }catch{return configured;}
}
export const API_BASE_URL=configuredBaseUrl();
const refreshing=new Map<string,Promise<AuthSession>>();
interface Options {method?:string;body?:unknown;key?:string;public?:boolean;form?:FormData;retry?:boolean;webSession?:WebAuthSession}
const codes:Record<string,AppErrorCode>={UNAUTHORIZED:'unauthorized',SESSION_CHANGED:'unauthorized',NOT_FOUND:'not_found',INSUFFICIENT_FUNDS:'insufficient_funds',PAYMENT_FAILED:'payment_failed',VALIDATION:'validation'};
interface LoginBinding { id: number }
let nextLoginId=0;
let observedSession=useAuthStore.getState().session;
let currentLogin:LoginBinding|undefined=observedSession?{id:++nextLoginId}:undefined;
const refreshContinuations=new WeakMap<AuthSession,LoginBinding>();
// A token rotation continues one login; signing out or signing in again starts
// another, even for the same account. An old action must never follow that switch.
useAuthStore.subscribe(state=>{
 if(state.session===observedSession)return;
 const continuation=state.session&&refreshContinuations.get(state.session);
 currentLogin=state.session?(continuation&&continuation===currentLogin?continuation:{id:++nextLoginId}):undefined;
 observedSession=state.session;
});
function requireLogin(binding:LoginBinding|undefined){
 if(binding!==currentLogin)throw new AppError('unauthorized','Session changed',{serverCode:'SESSION_CHANGED'});
}
/** Bind completion to one login while allowing that login to refresh its credentials. */
export function captureLoginGuard(): () => void {
 const binding=currentLogin;
 return () => requireLogin(binding);
}
export async function refreshSession():Promise<AuthSession>{
 const previous=useAuthStore.getState().session;
 if(!previous)throw new AppError('unauthorized','Sign in to continue');
 const binding=currentLogin;
 const refreshKey=isWebSession(previous)?previous.sessionId:previous.refreshToken;
 const existing=refreshing.get(refreshKey);if(existing)return existing;
 const rotate=async()=>{
 requireLogin(binding);
 let next:AuthSession;
 let verifiedUser:User|undefined;
 if(webSessionsEnabled){
  if(!isWebSession(previous))throw sessionChanged();
  const boot=await bootstrapBrowserSession(bindingOf(previous));
  requireLogin(binding);
  if(!boot)throw sessionChanged();
  verifiedUser=boot.user;
  // Another tab may already have rotated this login. Adopt its still-valid
  // access session rather than rotating it again and disconnecting that tab.
  // Missing/expired access is represented by bootstrap's past expiry and must
  // still use the normal protected refresh path.
  next=boot.session.sessionId!==previous.sessionId&&Date.parse(boot.session.expiresAt)>Date.now()+30000
   ?boot.session
   :validateWebSession(await api<AuthSession>('/auth/refresh',{method:'POST',body:{},public:true,webSession:boot.session}));
  if(!sameBrowserLogin(bindingOf(previous),bindingOf(next)))throw sessionChanged();
 }else{
  if(isWebSession(previous))throw sessionChanged();
  next=await api<AuthSession>('/auth/refresh',{method:'POST',body:{refreshToken:previous.refreshToken},public:true});
 }
 requireLogin(binding);
 const state=useAuthStore.getState();if(state.session!==previous)throw sessionChanged();
 if(binding)refreshContinuations.set(next,binding);
 await state.signIn(next,verifiedUser??state.user!);return next;
 };
 const operation=(async()=>{try{
 return await(webSessionsEnabled?withBrowserAuthLock(rotate):rotate());
 }catch(e){if(e instanceof AppError&&e.code==='unauthorized'&&useAuthStore.getState().session===previous)await useAuthStore.getState().signOut();throw e;}finally{refreshing.delete(refreshKey);}})();
 refreshing.set(refreshKey,operation);
 return operation;
}
export async function api<T>(path:string,options:Options={}):Promise<T>{
 return requestForLogin<T>(path,options,options.public?undefined:currentLogin);
}
async function requestForLogin<T>(path:string,options:Options,binding:LoginBinding|undefined):Promise<T>{
 if(!API_BASE_URL)throw new AppError('network','Set EXPO_PUBLIC_API_BASE_URL to your ParkFlow backend URL.');
 if(!options.public)requireLogin(binding);
 let session=useAuthStore.getState().session;
 if(!options.public&&session&&Date.parse(session.expiresAt)<=Date.now()+30000){session=await refreshSession();}
 if(!options.public)requireLogin(binding);
 let response:Response;
 const cookieSession=options.webSession??(!options.public&&isWebSession(session)?session:undefined);
 try{response=await fetch(API_BASE_URL+path,{method:options.method??'GET',headers:{...(!options.form?{'Content-Type':'application/json'}:{}),...(webSessionsEnabled?webRequestHeaders(cookieSession):!options.public&&session&&!isWebSession(session)?{Authorization:`Bearer ${session.accessToken}`} :{}),...(options.key?{'Idempotency-Key':options.key}:{})},...(webSessionsEnabled?{credentials:'include' as const}:{}),body:options.form??(options.body===undefined?undefined:JSON.stringify(options.body)),signal:AbortSignal.timeout(15000)});}catch{if(!options.public)requireLogin(binding);throw new AppError('network','Could not reach the ParkFlow backend');}
 if(!options.public)requireLogin(binding);
 const data=await response.json().catch(()=>null) as {error?:{code:string;message:string;details?:Record<string,unknown>}}|null;
 if(!options.public)requireLogin(binding);
 if(response.status===401&&!options.public&&options.retry!==false&&session){await refreshSession();requireLogin(binding);return requestForLogin<T>(path,{...options,retry:false},binding);}
 if(!response.ok||data?.error){const code=data?.error?.code??'UNKNOWN';throw new AppError(codes[code]??(response.status===409?'conflict':response.status===400?'validation':'unknown'),data?.error?.message??'The request failed',{...data?.error?.details,serverCode:code,status:response.status});}
 return data as T;
}
export function query(params:Record<string,unknown>){const entries=Object.entries(params).filter(([,v])=>v!==undefined&&v!==null);return entries.length?'?'+entries.map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&'):'';}
export const segment=(s:string)=>encodeURIComponent(s);
// Persist only a request key, never authoritative business state. Retries after app restarts
// reuse the same key if the previous response was lost.
const pending=new Map<string,Promise<unknown>>();
const requestKeyOperations=new Map<string,Promise<void>>();
const requestKeysToRestore=new Map<string,string>();
const acknowledgedRequestKeys=new Map<string,string>();
function withRequestKey<T>(storageKey:string,operation:()=>Promise<T>):Promise<T>{
 const previous=requestKeyOperations.get(storageKey)??Promise.resolve();
 const result=previous.then(operation,operation);
 const tail=result.then(()=>undefined,()=>undefined);
 requestKeyOperations.set(storageKey,tail);
 void tail.then(()=>{if(requestKeyOperations.get(storageKey)===tail)requestKeyOperations.delete(storageKey);});
 return result;
}
async function restoreRequestKey(storageKey:string){
 const key=requestKeysToRestore.get(storageKey);
 if(key){await secureStorage.setItem(storageKey,key);requestKeysToRestore.delete(storageKey);}
}
function getRequestKey(storageKey:string,binding:LoginBinding|undefined):Promise<string>{
 return withRequestKey(storageKey,async()=>{
  requireLogin(binding);
  await restoreRequestKey(storageKey);
  requireLogin(binding);
  let key=await secureStorage.getItem(storageKey);
  requireLogin(binding);
  if(!key||key===acknowledgedRequestKeys.get(storageKey)){key=`request-${Date.now()}-${Math.random().toString(36).slice(2)}`;await secureStorage.setItem(storageKey,key);}
  requireLogin(binding);
  acknowledgedRequestKeys.delete(storageKey);
  return key;
 });
}
function clearRequestKey(storageKey:string,key:string,binding:LoginBinding|undefined):Promise<void>{
 return withRequestKey(storageKey,async()=>{
  requireLogin(binding);
  await restoreRequestKey(storageKey);
  requireLogin(binding);
  const stored=await secureStorage.getItem(storageKey);
  requireLogin(binding);
  if(stored!==key)return;
  // A new login must wait until a non-cancellable delete either finishes for
  // its owner or restores the recovery key. Failed restoration blocks a later
  // action from creating another key until the original can be persisted.
  requestKeysToRestore.set(storageKey,key);
  try{
   await secureStorage.removeItem(storageKey);
   if(binding!==currentLogin){await restoreRequestKey(storageKey);requireLogin(binding);}
   requestKeysToRestore.delete(storageKey);
  }catch(error){
   await restoreRequestKey(storageKey).catch(()=>undefined);
   throw error;
  }
 });
}
export function mutation<T>(path:string,body:unknown={}):Promise<T>{
 const binding=currentLogin;
 const scope=(useAuthStore.getState().session?.userId??'anonymous')+path+JSON.stringify(body);
 const pendingScope=`${binding?.id??0}:${scope}`;
 const existing=pending.get(pendingScope);if(existing)return existing as Promise<T>;
 const storageKey='pf_request_'+Array.from(scope).map(c=>c.charCodeAt(0).toString(16)).join('_');
 const request=new Promise<T>((resolve,reject)=>{
  const forget=()=>{if(pending.get(pendingScope)===request)pending.delete(pendingScope);};
  const finish=(complete:()=>void)=>{forget();complete();};
  void(async()=>{
   let key:string|undefined;
   try{
    key=await getRequestKey(storageKey,binding);
    requireLogin(binding);
    const result=await requestForLogin<T>(path,{method:'POST',body,key},binding);
    await withAuthenticationPersistence(async()=>{
     requireLogin(binding);
     try{await clearRequestKey(storageKey,key!,binding);}catch{
      requireLogin(binding);
      // The server has confirmed success. Optional device cleanup must not
      // report failure and provoke another business operation after a restart.
      // Retire a key that survived cleanup before the next intentional action.
      requestKeysToRestore.delete(storageKey);
      acknowledgedRequestKeys.set(storageKey,key!);
     }
     requireLogin(binding);
     // Resolve the original promise while login publication is still blocked.
     // Otherwise a queued sign-in could publish between deletion and resolution.
     finish(()=>resolve(result));
    });
   }catch(error){
    if(key&&error instanceof AppError&&error.code!=='network'&&Number(error.details?.status??500)<500){
     try{
      await withAuthenticationPersistence(async()=>{
       requireLogin(binding);
       await clearRequestKey(storageKey,key!,binding);
       finish(()=>reject(error));
      });
     }catch(cleanupError){finish(()=>reject(cleanupError));}
    }else finish(()=>reject(error));
   }finally{forget();}
  })();
 });
 pending.set(pendingScope,request);return request;
}
