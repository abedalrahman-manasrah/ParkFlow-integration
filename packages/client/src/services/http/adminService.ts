import type {
  AdminAnalytics,
  AdminAppeal,
  AdminAuditLog,
  AdminRoadReport,
  AdminSummary,
  AdminService,
  AdminUser,
  AdminZone,
} from '@parkflow/contracts/services';
import { api, query, segment } from './apiClient';

/**
 * Admin calls stay behind one boundary so the rest of the app never needs to
 * know the privileged API paths. The backend remains the source of truth for
 * every permission check.
 */
export const httpAdminService: AdminService = {
  summary: () => api<AdminSummary>('/admin/summary'),
  users: (search = '') => api<AdminUser[]>('/admin/users' + query({ query: search.trim() || undefined })),
  updateUser: (id, input) => api<{ id: string; role: AdminUser['role']; status: AdminUser['status'] }>(`/admin/users/${segment(id)}`, { method: 'PATCH', body: input }),
  zones: () => api<AdminZone[]>('/admin/parking-zones'),
  updateAvailability: (zoneId, input) =>
    api(`/admin/parking-zones/${segment(zoneId)}/availability`, { method: 'POST', body: input }),
  reports: () => api<AdminRoadReport[]>('/admin/road-reports'),
  moderateReport: (id, hidden) =>
    api(`/admin/road-reports/${segment(id)}`, { method: 'PATCH', body: { hidden } }),
  appeals: () => api<AdminAppeal[]>('/admin/appeals'),
  decideAppeal: (id, input) => api<AdminAppeal>(`/admin/appeals/${segment(id)}`, { method: 'PATCH', body: input }),
  auditLogs: () => api<AdminAuditLog[]>('/admin/audit-logs'),
  analytics: () => api<AdminAnalytics>('/operator/analytics'),
};
