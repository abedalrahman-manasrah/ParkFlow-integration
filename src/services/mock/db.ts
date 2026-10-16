import type {
  Appeal,
  AppNotification,
  ParkingSession,
  PaymentMethod,
  Permit,
  PointsEntry,
  RoadEvent,
  Transaction,
  User,
  UserVehicle,
  Vehicle,
  Violation,
  ViolationEvidence,
  Wallet,
  ZoneReport,
} from '@/types';
import { appStorage, STORAGE_KEYS } from '@/services/storage';

/**
 * The mock backend's storage. Everything user-scoped and mutable lives here and
 * is written through to AsyncStorage, which is what makes an in-flight parking
 * session survive an app kill — exactly as a real server would.
 */
export interface MockDatabase {
  users: User[];
  vehicles: Vehicle[];
  userVehicles: UserVehicle[];
  sessions: ParkingSession[];
  wallets: Wallet[];
  paymentMethods: PaymentMethod[];
  transactions: Transaction[];
  violations: Violation[];
  evidence: ViolationEvidence[];
  appeals: Appeal[];
  permits: Permit[];
  /** Community road posts and driver checkpoint reports (shared, not user-scoped). */
  roadEvents: RoadEvent[];
  /** Driver reports of zone availability (shared). */
  zoneReports: ZoneReport[];
  pointsLedger: PointsEntry[];
  notifications: AppNotification[];
}

const emptyDb = (): MockDatabase => ({
  users: [],
  vehicles: [],
  userVehicles: [],
  sessions: [],
  wallets: [],
  paymentMethods: [],
  transactions: [],
  violations: [],
  evidence: [],
  appeals: [],
  permits: [],
  roadEvents: [],
  zoneReports: [],
  pointsLedger: [],
  notifications: [],
});

let db: MockDatabase | null = null;
let loading: Promise<MockDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

/** Reads the DB once, then serves the in-memory copy. */
export async function getDb(): Promise<MockDatabase> {
  if (db) return db;
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await appStorage.getItem(STORAGE_KEYS.mockDb);
        db = raw ? { ...emptyDb(), ...(JSON.parse(raw) as MockDatabase) } : emptyDb();
      } catch {
        db = emptyDb();
      }
      return db;
    })();
  }
  return loading;
}

/** Serialised writes so concurrent mutations cannot interleave and lose data. */
export function persist(): Promise<void> {
  writeQueue = writeQueue
    .then(() => (db ? appStorage.setItem(STORAGE_KEYS.mockDb, JSON.stringify(db)) : undefined))
    .catch(() => undefined);
  return writeQueue;
}

/** Read-modify-write helper used by every mock service mutation. */
export async function mutate<T>(fn: (database: MockDatabase) => T | Promise<T>): Promise<T> {
  const database = await getDb();
  const result = await fn(database);
  await persist();
  return result;
}

export async function resetDb(): Promise<void> {
  db = emptyDb();
  loading = null;
  await appStorage.removeItem(STORAGE_KEYS.mockDb);
}
