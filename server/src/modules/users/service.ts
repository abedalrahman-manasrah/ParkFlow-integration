import { db } from '../../database/client';
import { requireValue } from '../../utils/errors';
export async function getUser(id:string){return requireValue(await db.user.findUnique({where:{id}}));}
export async function updateUser(id:string,input:{fullName?:string;locale?:string;gender?:'female'|'male'}){return db.user.update({where:{id},data:{...input,...(input.fullName?{firstName:input.fullName.split(' ')[0],lastName:input.fullName.split(' ').slice(1).join(' ')}:{})}});}
export async function preferences(id:string){return (await getUser(id)).notificationPreferences;}

export async function updatePreferences(id:string,input:Record<string,boolean>){return (await db.user.update({where:{id},data:{notificationPreferences:input}})).notificationPreferences;}
