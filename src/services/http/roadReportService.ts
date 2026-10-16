import type { RoadReportService } from '../types';
import { api, mutation, query, segment } from './apiClient';

export const httpRoadReportService: RoadReportService = {
  list: (bounds) => api('/road-reports' + query({ ...bounds })),
  get: (reportId) => api(`/road-reports/${segment(reportId)}`),
  create: (input) => mutation('/road-reports', input),
  confirm: (reportId) => mutation(`/road-reports/${segment(reportId)}/confirm`),
  reject: (reportId) => mutation(`/road-reports/${segment(reportId)}/not-there`),
};
