import type { NotificationService } from '../types';
import { AppError } from '@/utils/errors';
import { api,segment } from './apiClient';
export const httpNotificationService:NotificationService={list:()=>api('/notifications'),unreadCount:()=>api('/notifications/unread-count'),async markRead(id){await api(`/notifications/${segment(id)}/read`,{method:'PATCH',body:{}});},async markAllRead(){await api('/notifications/read-all',{method:'PATCH',body:{}});},async emit(){throw new AppError('unauthorized','Notifications are created by the server');}};
