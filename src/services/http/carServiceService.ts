import type { CarServiceApi } from '@/types';
import { api, query } from './apiClient';

export const httpCarServiceService: CarServiceApi = {
  list: (bounds, filters) => api('/car-services' + query({ ...bounds, ...filters }), { public: true }),
};
