import type { TrustService } from '../types';
import { api } from './apiClient';
export const httpTrustService:TrustService={get:()=>api('/trust/me')};
