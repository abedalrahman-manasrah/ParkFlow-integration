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
  PhoneOtpChallenge,
  ParkingEntryMethod,
  ParkingFacility,
  FacilityNavigation,
  ParkingMode,
  ParkingFeedback,
  ParkingFeedbackDelayBucket,
  ParkingFeedbackOutcome,
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
} from './index';

/**
 * Every screen talks to these interfaces, never to a mock array. Swapping the
 * mock implementation for HTTP is a one-line change in `services/index.ts`.
 */

export interface AuthConfig {
  developmentLoginEnabled: boolean;
  developmentEmailLoginEnabled: boolean;
  loginMethod: 'email' | 'phone';
}

/** Client-only guard: an abandoned verification must not apply its session. */
export interface AuthVerificationOptions {
  shouldApply?: () => boolean;
}

export interface AuthService {
  getConfig(): Promise<AuthConfig>;
  devPhoneLogin(input: { phone: string; purpose: 'register' | 'login'; fullName?: string }): Promise<AuthResult>;
  requestPhoneOtp(input: { phone: string; purpose: 'register' | 'login'; fullName?: string }): Promise<PhoneOtpChallenge>;
  verifyPhoneOtp(input: { challengeId: string; code: string }): Promise<AuthResult>;
  completePhoneProfile(input: { email?: string | null; nationalId?: string | null; fullName?: string }): Promise<User>;
  requestOtp(input: { email: string; purpose?: 'register' | 'login'; fullName?: string }): Promise<OtpChallenge>;
  devLogin(input: { email: string; purpose?: 'register' | 'login'; fullName?: string }): Promise<AuthResult>;
  verifyOtp(input: {
    challengeId: string;
    code: string;
  }, options?: AuthVerificationOptions): Promise<AuthResult>;
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

export interface SubmitParkingFeedbackInput {
  userId: string;
  zoneId: string;
  outcome: ParkingFeedbackOutcome;
  delayBucket?: ParkingFeedbackDelayBucket;
  sessionId?: string;
  reservationId?: string;
  idempotencyKey: string;
}

export interface ParkingService {
  listZones(query?: ZoneQuery): Promise<ParkingZone[]>;
  getZone(zoneId: string): Promise<ParkingZone>;
  getZoneByCode(code: string): Promise<ParkingZone>;
  getFacility(facilityId: string): Promise<ParkingFacility>;
  getFacilityNavigation(facilityId: string): Promise<FacilityNavigation>;
  getLayout(parkingId: string): Promise<import('./index').ParkingLayout>;

  startSession(input: StartSessionInput): Promise<ParkingSession>;
  stopSession(sessionId: string): Promise<ParkingSession>;
  extendSession(sessionId: string, additionalMinutes: number): Promise<ParkingSession>;
  /** Retries payment for a session that ended unpaid. */
  settleSession(sessionId: string): Promise<ParkingSession>;
  submitParkingFeedback(input: SubmitParkingFeedbackInput): Promise<ParkingFeedback>;

  getSession(sessionId: string): Promise<ParkingSession>;
  listActiveSessions(userId: string): Promise<ParkingSession[]>;
  getActiveSessionForVehicle(vehicleId: string): Promise<ParkingSession | undefined>;
  listSessions(input: { userId: string; vehicleId?: string; limit?: number }): Promise<
    ParkingSession[]
  >;

  quoteReservation(input: import('./index').ParkingReservationSelection): Promise<import('./index').ParkingReservationQuote>;
  createReservation(input: import('./index').CreateParkingReservationInput): Promise<ParkingReservation>;
  listReservations(): Promise<ParkingReservation[]>;
  getReservation(reservationId: string): Promise<ParkingReservation>;
  cancelReservation(reservationId: string): Promise<ParkingReservation>;
  validateReservationQr(token: string): Promise<import('./index').QrValidationResult>;
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
  update(userId: string, input: Partial<Pick<User, 'fullName' | 'locale' | 'email'>> & { nationalId?: string | null }): Promise<User>;
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

export type OperatorAvailability = 'available' | 'limited' | 'full' | 'unknown';

export interface OperatorFeedHealth {
  stale: boolean;
  conflict: boolean;
  snapshotAgeSeconds: number | null;
  crowdAgeSeconds: number | null;
  signals: {
    operator: { availability: OperatorAvailability; recordedAt: string; confidence: number } | null;
    crowd: { availability: OperatorAvailability; reportedAt: string } | null;
  };
}

export interface OperatorZoneSummary {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
  /** A zone may not have a published capacity yet. */
  capacity: number | null;
  active: boolean;
  latestProvenance: unknown;
  activeReservationCount: number;
  feedHealth: OperatorFeedHealth;
}

export interface OperatorSummary {
  assignedZones: OperatorZoneSummary[];
  assignedZoneCount: number;
  /** Legacy server alias; clients should use assignedZones. */
  zones?: OperatorZoneSummary[];
}

export interface OperatorReservation {
  id: string;
  parkingZoneId: string;
  userId: string;
  spotId: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  hourlyRateSnapshot: number;
  estimatedTotalPriceSnapshot: number;
  currency: string;
  priceIsDemo: boolean;
  isDemoReservation: boolean;
  inventoryMode?: 'demo' | 'live';
  guarantee?: 'none' | 'operator_backed';
  holdExpiresAt?: string;
  status: import('./index').ParkingReservationStatus;
  publicCode: string;
  qrValue?: string;
  checkedInAt?: string | null;
  operatorResolution?: 'none' | 'alternative' | 'refund_requested';
  operatorResolutionNote?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; fullName: string; phone: string | null; email: string | null };
}

export interface OperatorService {
  summary(): Promise<OperatorSummary>;
  updateAvailability(zoneId: string, input: {
    availability: OperatorAvailability;
    availableSpaces?: number;
    occupiedSpaces?: number;
    confidence: number;
    reason?: string;
  }): Promise<Record<string, unknown>>;
  listReservations(zoneId: string): Promise<OperatorReservation[]>;
  checkIn(reservationId: string, qrToken?: string): Promise<OperatorReservation>;
  resolveReservation(reservationId: string, input: { resolution: 'alternative' | 'refund_requested'; note?: string }): Promise<OperatorReservation>;
  feedHealth(): Promise<{ zones: Array<{ zoneId: string; code: string; name: string; latestProvenance: unknown; activeReservationCount: number; feedHealth: OperatorFeedHealth }>; staleZones: string[]; conflictingZones: string[] }>;
}

export type AdminRole = User['role'];
export type AdminStatus = 'ACTIVE' | 'SUSPENDED';

export interface AdminUser {
  id: string;
  phone?: string | null;
  email?: string | null;
  fullName: string;
  role: Exclude<AdminRole, undefined>;
  status: AdminStatus;
  createdAt: string;
}

export interface AdminZone {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
  capacity: number | null;
  active: boolean;
}

export interface AdminRoadReport {
  id: string;
  checkpointId?: string;
  status?: string;
  hidden: boolean;
  reportedAt: string;
  note?: string | null;
  checkpoint?: { nameEn: string; nameAr: string };
  user?: { fullName: string };
}

export interface AdminAppeal {
  id: string;
  userId: string;
  violationId: string;
  status: string;
  submittedAt: string;
  decisionNote?: string | null;
  reference: string;
  reason: string;
  notes: string;
  user?: { fullName: string; email: string | null };
  violation?: { plateNumber: string; reason: string; reasonAr: string; amount: number; status: string };
}

export interface AdminAuditLog {
  id: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
  actor?: { fullName: string; email: string | null };
}

export interface AdminAnalytics {
  window?: { startTime: string; endTime: string };
  zones?: Array<{
    zoneId: string;
    name: string;
    nameAr: string;
    occupancyTrend?: unknown[];
    reservationConversion?: { total: number; checkedIn: number; rate: number };
    feedQuality?: { samples: number; latest: unknown; trustedSamples: number };
  }>;
}

export interface AdminService {
  summary(): Promise<AdminSummary>;
  users(search?: string): Promise<AdminUser[]>;
  updateUser(id: string, input: { role?: Exclude<AdminRole, undefined>; status?: AdminStatus }): Promise<{ id: string; role: Exclude<AdminRole, undefined>; status: AdminStatus }>;
  zones(): Promise<AdminZone[]>;
  updateAvailability(zoneId: string, input: { availability: OperatorAvailability; availableSpaces?: number; occupiedSpaces?: number; source: 'ADMIN'; confidence: number; reason?: string }): Promise<Record<string, unknown>>;
  reports(): Promise<AdminRoadReport[]>;
  moderateReport(id: string, hidden: boolean): Promise<AdminRoadReport>;
  appeals(): Promise<AdminAppeal[]>;
  decideAppeal(id: string, input: { status: 'approved' | 'rejected'; decisionNote: string }): Promise<AdminAppeal>;
  auditLogs(): Promise<AdminAuditLog[]>;
  analytics(): Promise<AdminAnalytics>;
}

export interface AdminSummary {
  activeUsers: number;
  suspendedUsers: number;
  activeZones: number;
  visibleReports: number;
  openAppeals: number;
  totalReservations: number;
  checkedInReservations: number;
}

/** Crash calling config and the record of each detection. */
export interface EmergencyService {
  config(): Promise<import('./emergency').EmergencyConfig>;
  recordCrash(input: import('./emergency').CrashEventInput, idempotencyKey?: string): Promise<unknown>;
}

export interface Services {
  evStations: import('./evStation').EvStationApi;
  carServices: import('./carService').CarServiceApi;
  tourismPlaces: import('./tourismPlace').TourismPlaceApi;
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
  operator: OperatorService;
  admin: AdminService;
  sharing: import('./sharing').SharingService;
  gates: import('./gate').GateService;
  emergency: EmergencyService;
}

export type { Vehicle, UserVehicleView };
