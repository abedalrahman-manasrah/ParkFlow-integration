import Constants from 'expo-constants';

export type ClientApplication = 'customer' | 'management';

const configuredApplication: unknown = Constants.expoConfig?.extra?.parkflowApplication;
if (configuredApplication != null && configuredApplication !== 'customer' && configuredApplication !== 'management') {
  throw new Error('Invalid ParkFlow application identity.');
}

// Older customer development builds have no explicit identity. Never default to management.
export const clientApplication: ClientApplication = configuredApplication === 'management' ? 'management' : 'customer';

const configuredApiBaseUrl: unknown = Constants.expoConfig?.extra?.apiBaseUrl;
export const runtimeApiBaseUrl = typeof configuredApiBaseUrl === 'string' ? configuredApiBaseUrl : undefined;

const configuredWebSocketPolling: unknown = Constants.expoConfig?.extra?.webSocketPolling;
export const runtimeWebSocketPolling = configuredWebSocketPolling === true;
