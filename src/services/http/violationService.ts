import { Platform } from 'react-native';
import type { ViolationService } from '../types';
import type { AppealAttachment,ViolationEvidence } from '@/types';
import { api,query,segment } from './apiClient';
async function upload(attachment:AppealAttachment){const form=new FormData();if(Platform.OS==='web'){const blob=await (await fetch(attachment.uri)).blob();form.append('file',blob,attachment.name);}else{form.append('file',{uri:attachment.uri,name:attachment.name,type:attachment.mimeType} as unknown as Blob);}return api<{id:string}>('/uploads',{method:'POST',form});}
export const httpViolationService:ViolationService={
 list:({vehicleId})=>api('/violations'+query({vehicleId})),get:id=>api(`/violations/${segment(id)}`),
 async getEvidence(id){return (await api<ViolationEvidence|null>(`/violations/${segment(id)}/evidence`))??undefined;},
 pay:({violationId,idempotencyKey})=>api(`/violations/${segment(violationId)}/pay`,{method:'POST',body:{},key:idempotencyKey}),
 async submitAppeal({violationId,reason,notes,attachments}){const uploaded=await Promise.all(attachments.map(upload));return api(`/violations/${segment(violationId)}/appeals`,{method:'POST',body:{reason,notes,attachmentIds:uploaded.map(u=>u.id)}});},
 getAppeal:id=>api(`/appeals/${segment(id)}`),
};
