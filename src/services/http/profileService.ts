import type { ProfileService } from '../types';
import { api } from './apiClient';
export const httpProfileService:ProfileService={get:()=>api('/users/me'),update:(_u,body)=>api('/users/me',{method:'PATCH',body}),getNotificationPreferences:()=>api('/users/me/notification-preferences')};
