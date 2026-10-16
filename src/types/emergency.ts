/** Server-side switch for crash calling. Off until an emergency number is configured. */
export interface EmergencyConfig {
  enabled: boolean;
  callNumber: string | null;
  countdownSeconds: number;
}

export type CrashEventOutcome = 'cancelled' | 'called' | 'call_failed' | 'no_number';

export interface CrashEventInput {
  detectedAt: string;
  latitude?: number;
  longitude?: number;
  speedKmh?: number;
  peakG: number;
  rotationDeg?: number;
  outcome: CrashEventOutcome;
}
