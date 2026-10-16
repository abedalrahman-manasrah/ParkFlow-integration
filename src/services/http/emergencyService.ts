import type { EmergencyService } from '../types';
import { api, mutation } from './apiClient';

export const httpEmergencyService: EmergencyService = {
  config: () => api('/emergency/config'),
  recordCrash: (input) => mutation('/emergency/crash-events', input),
};
