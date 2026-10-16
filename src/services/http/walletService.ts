import type { WalletService } from '../types';
import { api,query,segment } from './apiClient';
export const httpWalletService:WalletService={
 get:()=>api('/wallet'),topUp:({userId,idempotencyKey,...body})=>api('/wallet/topups',{method:'POST',body,key:idempotencyKey}),
 setAutoTopUp:({userId,...body})=>api('/wallet/auto-topup',{method:'PATCH',body}),
 listPaymentMethods:()=>api('/payment-methods'),addPaymentMethod:({userId,...body})=>api('/payment-methods',{method:'POST',body}),
 async setDefaultPaymentMethod(_u,id){await api(`/payment-methods/${segment(id)}/default`,{method:'PATCH',body:{}});},
 async removePaymentMethod(_u,id){await api(`/payment-methods/${segment(id)}`,{method:'DELETE',body:{}});},
 listTransactions:({types,limit})=>api('/wallet/transactions'+query({types:types?.join(','),limit})),getTransaction:id=>api(`/wallet/transactions/${segment(id)}`),
};
