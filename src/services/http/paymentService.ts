import type { PaymentService } from '../types';
import { AppError } from '@/utils/errors';
export const httpPaymentService:PaymentService={async authorize(){throw new AppError('unauthorized','Payment authorization is performed by the backend during top-up');}};
