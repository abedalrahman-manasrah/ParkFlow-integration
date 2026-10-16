import type { ID, ISODateString } from './common';

export interface Wallet {
  id: ID;
  userId: ID;
  /** Minor units. */
  balance: number;
  currency: 'ILS';
  autoTopUpEnabled: boolean;
  autoTopUpThreshold: number;
  autoTopUpAmount: number;
  defaultPaymentMethodId?: ID;
  updatedAt: ISODateString;
}

export type PaymentMethodBrand = 'visa' | 'mastercard' | 'amex' | 'wallet' | 'cash';

export interface PaymentMethod {
  id: ID;
  userId: ID;
  brand: PaymentMethodBrand;
  /** Only ever the last four — full PANs never touch this app. */
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  holderName?: string;
  isDefault: boolean;
  createdAt: ISODateString;
}

export type TransactionType =
  | 'topup'
  | 'parking_payment'
  | 'violation_payment'
  | 'refund'
  | 'adjustment'
  /** Verified ParkFlow points paid into the wallet. */
  | 'reward'
  /** Seat held for a shared ride, or a private parking booking. */
  | 'ride_payment'
  | 'spot_payment'
  /** Paid out to drivers and hosts after a ride or booking ends. */
  | 'earning';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export interface Transaction {
  id: ID;
  userId: ID;
  walletId: ID;
  type: TransactionType;
  status: TransactionStatus;
  /** Signed minor units: negative debits the wallet. */
  amount: number;
  currency: 'ILS';
  balanceAfter: number;
  title: string;
  titleAr: string;
  subtitle?: string;
  subtitleAr?: string;
  paymentMethodId?: ID;
  parkingSessionId?: ID;
  violationId?: ID;
  vehicleId?: ID;
  reference: string;
  failureReason?: string;
  createdAt: ISODateString;
}

export interface PaymentIntent {
  id: ID;
  amount: number;
  currency: 'ILS';
  status: 'requires_confirmation' | 'processing' | 'succeeded' | 'failed';
  paymentMethodId?: ID;
  failureReason?: string;
  createdAt: ISODateString;
}
