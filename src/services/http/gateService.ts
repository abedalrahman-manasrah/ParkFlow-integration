import type { GateService } from '@/types';
import { api, mutation, query, segment } from './apiClient';

export const httpGateService: GateService = {
  gatePass: (vehicleId) => api(`/gate-pass${query({ vehicleId })}`),
  zones: () => api('/gate/zones'),
  visits: (zoneId) => api(`/gate/zones/${segment(zoneId)}/visits`),
  // Every scan is a new event, so these skip the retry-key cache that `mutation` keeps per body.
  entry: (scan) => api('/gate/entry', { method: 'POST', body: scan }),
  exit: (scan) => api('/gate/exit', { method: 'POST', body: scan }),
  saveRules: (zoneId, rules) => api(`/gate/zones/${segment(zoneId)}/rules`, { method: 'PATCH', body: rules }),
  patrolCheck: (zoneId, plate) => api(`/enforcement/check${query({ zoneId, plate })}`),
  patrolIssue: (zoneId, plate) => mutation('/enforcement/violations', { zoneId, plate }),
};
