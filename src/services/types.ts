import type {
  Appeal,
  AppealAttachment,
  AppealReason,
  AppNotification,
  AuthSession,
  CheckpointState,
  CheckpointStatus,
  GeoPoint,
  NotificationPreferences,
  OtpChallenge,
  ParkingEntryMethod,
  ParkingFacility,
  ParkingMode,
  ParkingReservation,
  ParkingSession,
  ParkingZone,
  PaymentMethod,
  Permit,
  AwardedPoints,
  PointsEntry,
  ReportedAvailability,
  RoadFeedItem,
  RoadReport,
  RoadReportBounds,
  CreateRoadReportInput,
  CreateRoadReportResult,
  RouteResult,
  Transaction,
  TransactionType,
  TrustSummary,
  User,
  UserVehicleView,
  Vehicle,
  VehicleType,
  Violation,
  ViolationEvidence,
  Wallet,
  ZoneReport,
} from '@/types';

/**
 * Every screen talks to these interfaces, never to a mock array. Swapping the
 * mock implementation for HTTP is a one-line change in `services/index.ts`.
 */

export interface AuthService {
  requestOtp(input: { email: string }): Promise<OtpChallenge>;
  devLogin(input: { email: string }): Promise<AuthResult>;
  verifyOtp(input: {
    challengeId: string;
    code: string;
  }): Promise<AuthResult>;
  completeProfile(input: { userId: string; fullName: string }): Promise<User>;
  refresh(refreshToken: string): Promise<AuthSession>;
  signOut(): Promise<void>;
}

export interface AuthResult {
  session: AuthSession;
  user: User;
  isNewUser: boolean;
}

export interface CreateVehicleInput {
  plateNumber: string;
  type: VehicleType;
  make?: string;
  model?: string;
  color?: string;
  colorHex?: string;
  nickname?: string;
}

export interface VehicleService {
  list(userId: string): Promise<UserVehicleView[]>;
  get(userId: string, vehicleId: string): Promise<UserVehicleView>;
  create(userId: string, input: CreateVehicleInput): Promise<UserVehicleView>;
  update(
    userId: string,
    vehicleId: string,
    input: Partial<CreateVehicleInput>,
  ): Promise<UserVehicleView>;
  setDefault(userId: string, vehicleId: string): Promise<void>;
  /** Unlinks from the account. History and violations are never deleted. */
  unlink(userId: string, vehicleId: string): Promise<void>;
  permits(vehicleId: string): Promise<Permit[]>;
}

export interface ZoneQuery {
  near?: GeoPoint;
  radiusMeters?: number;
  search?: string;
}

export interface StartSessionInput {
  userId: string;
  vehicleId: string;
  zoneId: string;
  mode: ParkingMode;
  /** Required for prepaid; ignored for start/stop. */
  durationMinutes?: number;
  entryMethod: ParkingEntryMethod;
  /** Guards against double taps creating two sessions. */
  idempotencyKey: string;
}

export interface ParkingService {
  listZones(query?: ZoneQuery): Promise<ParkingZone[]>;
  getZone(zoneId: string): Promise<ParkingZone>;
  getZoneByCode(code: string): Promise<ParkingZone>;
  getFacility(facilityId: string): Promise<ParkingFacility>;
  getLayout(parkingId: string): Promise<import('@/types').ParkingLayout>;

  startSession(input: StartSessionInput): Promise<ParkingSession>;
  stopSession(sessionId: string): Promise<ParkingSession>;
  extendSession(sessionId: string, additionalMinutes: number): Promise<ParkingSession>;
  /** Retries payment for a session that ended unpaid. */
  settleSession(sessionId: string): Promise<ParkingSession>;

  getSession(sessionId: string): Promise<ParkingSession>;
  listActiveSessions(userId: string): Promise<ParkingSession[]>;
  getActiveSessionForVehicle(vehicleId: string): Promise<ParkingSession | undefined>;
  listSessions(input: { userId: string; vehicleId?: string; limit?: number }): Promise<
    ParkingSession[]
  >;

  createReservation(input: import('@/types').CreateParkingReservationInput): Promise<ParkingReservation>;
  listReservations(): Promise<ParkingReservation[]>;
  getReservation(reservationId: string): Promise<ParkingReservation>;
  cancelReservation(reservationId: string): Promise<ParkingReservation>;
  validateReservationQr(token: string): Promise<import('@/types').QrValidationResult>;
}

export interface WalletService {
  get(userId: string): Promise<Wallet>;
  topUp(input: {
    userId: string;
    amount: number;
    paymentMethodId: string;
    idempotencyKey: string;
  }): Promise<{ wallet: Wallet; transaction: Transaction }>;
  setAutoTopUp(input: {
    userId: string;
    enabled: boolean;
    threshold?: number;
    amount?: number;
  }): Promise<Wallet>;

  listPaymentMethods(userId: string): Promise<PaymentMethod[]>;
  addPaymentMethod(input: {
    userId: string;
    /** Only the last four ever reaches this layer. */
    last4: string;
    brand: PaymentMethod['brand'];
    expiryMonth: number;
    expiryYear: number;
    holderName?: string;
    makeDefault?: boolean;
  }): Promise<PaymentMethod>;
  setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void>;
  removePaymentMethod(userId: string, paymentMethodId: string): Promise<void>;

  listTransactions(input: {
    userId: string;
    types?: TransactionType[];
    limit?: number;
  }): Promise<Transaction[]>;
  getTransaction(transactionId: string): Promise<Transaction>;
}

/**
 * Card handling is entirely the provider's job. This app never sees a PAN — the
 * mock mirrors that boundary so the real integration slots straight in.
 */
export interface PaymentService {
  authorize(input: {
    amount: number;
    paymentMethodId: string;
    description: string;
    idempotencyKey: string;
  }): Promise<{ intentId: string; status: 'succeeded' | 'failed'; failureReason?: string }>;
}

export interface ViolationService {
  list(input: { userId: string; vehicleId?: string }): Promise<Violation[]>;
  get(violationId: string): Promise<Violation>;
  getEvidence(violationId: string): Promise<ViolationEvidence | undefined>;
  pay(input: { violationId: string; userId: string; idempotencyKey: string }): Promise<Violation>;
  submitAppeal(input: {
    violationId: string;
    userId: string;
    reason: AppealReason;
    notes: string;
    attachments: AppealAttachment[];
  }): Promise<Appeal>;
  getAppeal(appealId: string): Promise<Appeal>;
}

export interface NotificationService {
  list(userId: string): Promise<AppNotification[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(notificationId: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
  /** Emitted by other services when something notable happens. */
  emit(notification: Omit<AppNotification, 'id' | 'createdAt'>): Promise<AppNotification>;
}

export interface ProfileService {
  get(userId: string): Promise<User>;
  update(userId: string, input: Partial<Pick<User, 'fullName' | 'locale'>>): Promise<User>;
  getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
}

/** Checkpoint status from one-tap driver reports. */
export interface RoadService {
  listCheckpoints(): Promise<CheckpointState[]>;
  feed(limit?: number): Promise<RoadFeedItem[]>;
  report(input: {
    userId: string;
    checkpointId: string;
    status: CheckpointStatus;
  }): Promise<{ event: RoadFeedItem; points?: AwardedPoints }>;
  reportZone(input: {
    userId: string;
    zoneId: string;
    availability: ReportedAvailability;
  }): Promise<{ report: ZoneReport; points?: AwardedPoints }>;
}

export interface RoadReportService {
  list(bounds: RoadReportBounds): Promise<RoadReport[]>;
  get(reportId: string): Promise<RoadReport>;
  create(input: CreateRoadReportInput): Promise<CreateRoadReportResult>;
  confirm(reportId: string): Promise<RoadReport>;
  reject(reportId: string): Promise<RoadReport>;
}

export interface RoutingService {
  getRoute(
    from: GeoPoint,
    to: GeoPoint,
    options?: {
      mode?: 'checkpoint-aware' | 'fastest';
      snapDestination?: boolean;
      maxAlternatives?: number;
    },
  ): Promise<RouteResult>;
}

export interface TrustService {
  get(userId: string): Promise<TrustSummary>;
}

/** Crash calling config and the record of each detection. */
export interface EmergencyService {
  config(): Promise<import('../types/emergency').EmergencyConfig>;
  recordCrash(input: import('../types/emergency').CrashEventInput): Promise<unknown>;
}

export interface Services {
  evStations: import('../types/evStation').EvStationApi;
  carServices: import('../types/carService').CarServiceApi;
  tourismPlaces: import('../types/tourismPlace').TourismPlaceApi;
  auth: AuthService;
  vehicles: VehicleService;
  parking: ParkingService;
  wallet: WalletService;
  payments: PaymentService;
  violations: ViolationService;
  notifications: NotificationService;
  profile: ProfileService;
  roads: RoadService;
  roadReports: RoadReportService;
  routing: RoutingService;
  trust: TrustService;
  sharing: import('../types/sharing').SharingService;
  gates: import('../types/gate').GateService;
  emergency: EmergencyService;
}

export type { Vehicle, UserVehicleView };
