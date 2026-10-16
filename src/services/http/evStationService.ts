import type { EvStationApi } from '@/types';
import { api, query } from './apiClient';
export const httpEvStationService: EvStationApi = {
  list: (bounds, filters) => api('/ev-stations' + query({ ...bounds, ...filters }), { public: true }),
};
