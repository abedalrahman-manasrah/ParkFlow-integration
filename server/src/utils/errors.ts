export class ApiError extends Error {
 constructor(public status:number,public code:string,message:string,public details?:unknown){super(message);}
}
export function requireValue<T>(value:T|null|undefined,message='Record not found'):T{if(value==null)throw new ApiError(404,'NOT_FOUND',message);return value;}
export function assert(condition:unknown,code:string,message:string,status=400):asserts condition {if(!condition)throw new ApiError(status,code,message);}
