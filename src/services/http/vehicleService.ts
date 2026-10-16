import type { VehicleService } from '../types';
import { api,segment } from './apiClient';
export const httpVehicleService:VehicleService={
 list:()=>api('/vehicles'),get:(_u,id)=>api(`/vehicles/${segment(id)}`),create:(_u,body)=>api('/vehicles',{method:'POST',body}),update:(_u,id,body)=>api(`/vehicles/${segment(id)}`,{method:'PATCH',body}),
 async setDefault(_u,id){await api(`/vehicles/${segment(id)}/default`,{method:'PATCH',body:{}});},
 async unlink(_u,id){await api(`/vehicles/${segment(id)}`,{method:'DELETE',body:{}});},
 permits:id=>api(`/vehicles/${segment(id)}/permits`),
};
