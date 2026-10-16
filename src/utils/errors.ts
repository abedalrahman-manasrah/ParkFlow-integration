import { usePreferencesStore } from '@/store/preferencesStore';

export type AppErrorCode =
  | 'network'
  | 'unauthorized'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'insufficient_funds'
  | 'payment_failed'
  | 'unknown';

/** Single error shape so every screen can render a consistent ErrorState. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) return new AppError('unknown', error.message);
  return new AppError('unknown', 'Something went wrong');
}

const ARABIC_MESSAGES: Record<AppErrorCode, string> = {
  network: 'لا يوجد اتصال. تحقق من الإنترنت وحاول مرة أخرى.',
  unauthorized: 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.',
  not_found: 'لم نتمكن من العثور على ما تبحث عنه.',
  validation: 'يرجى التحقق من البيانات والمحاولة مرة أخرى.',
  conflict: 'تعذّر تنفيذ الطلب بسبب تعارض في البيانات.',
  insufficient_funds: 'رصيد محفظتك غير كافٍ لهذه الدفعة.',
  payment_failed: 'تعذّر إتمام عملية الدفع.',
  unknown: 'حدث خطأ ما. حاول مرة أخرى.',
};

/** Copy shown to the user. Deliberately short and non-technical. */
export function errorMessage(error: unknown): string {
  const appError = toAppError(error);
  const locale = usePreferencesStore.getState().locale;
  if (locale === 'ar') return ARABIC_MESSAGES[appError.code];

  switch (appError.code) {
    case 'network':
      return 'No connection. Check your internet and try again.';
    case 'unauthorized':
      return 'Your session expired. Please sign in again.';
    case 'not_found':
      return "We couldn't find what you were looking for.";
    case 'insufficient_funds':
      return 'Your wallet balance is too low for this payment.';
    case 'payment_failed':
      return 'The payment could not be completed.';
    default:
      return appError.message || 'Something went wrong. Please try again.';
  }
}
