import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import * as database from '../src/database/client';
import * as auth from '../src/modules/auth/service';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

// Never let a failed assertion print an access token, refresh token, or raw error.
function safeOutcome(operation: Promise<unknown>) {
  return operation.then(
    () => ({ allowed: true }),
    (error: unknown) => {
      const failure = error as { status?: number; code?: string };
      return { allowed: false, status: failure?.status, code: failure?.code };
    },
  );
}

describe('native logout versus a refresh committing concurrently', () => {
  it.each([false, true])('revokes the complete rotating family when all=%s', async all => {
    const user = await database.db.user.create({
      data: {
        email: `audit-logout-race-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        role: 'USER',
      },
    });
    const originalAtomic = database.atomic;
    const transactionReady = barrier();
    const allowCommit = barrier();
    const observer = new PrismaClient();
    const pending: Promise<unknown>[] = [];
    let restoreBoundary: (() => void) | undefined;
    let paused = false;
    let refreshBackendPid: number | undefined;
    let rotated: Awaited<ReturnType<typeof auth.refresh>> | undefined;

    try {
      // Issue real native credentials before installing the one-shot spy.
      const initial = await originalAtomic(tx => auth.issue(tx, user, {}));
      const initialClaims = auth.verifyAccess(initial.accessToken);
      const independent = await originalAtomic(tx => auth.issue(tx, user, {}));

      const holdRefreshBeforeCommit: typeof database.atomic = async <T>(
        operation: (tx: database.Tx) => Promise<T>,
        isolationLevel?: Parameters<typeof database.atomic>[1],
      ): Promise<T> => originalAtomic(async tx => {
        // Run the complete real rotateRefresh callback, including successor
        // insertion and predecessor revocation, while its SQL remains uncommitted.
        const result = await operation(tx);
        const rows = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid()::int AS pid
        `;
        refreshBackendPid = rows[0]?.pid;
        paused = true;
        transactionReady.release();
        await allowCommit.promise;
        return result;
      }, isolationLevel);
      const boundary = vi.spyOn(database, 'atomic').mockImplementationOnce(holdRefreshBeforeCommit);
      restoreBoundary = () => boundary.mockRestore();

      const refreshing = auth.refresh(initial.refreshToken, {}).then(value => {
        rotated = value;
      });
      const refreshResult = safeOutcome(refreshing);
      pending.push(refreshResult);

      // A bounded wait also releases the transaction in finally if the spy fails
      // to intercept the imported binding or the real refresh rejects early.
      await vi.waitFor(() => expect(paused).toBe(true), { timeout: 5000, interval: 20 });
      await transactionReady.promise;
      expect(typeof refreshBackendPid).toBe('number');

      const loggingOut = auth.logout(user.id, initialClaims.sid, all);
      const logoutResult = safeOutcome(loggingOut);
      pending.push(logoutResult);

      // Observe SQL ordering, not elapsed time. Logout's UPDATE must already have
      // taken its statement snapshot and be blocked by this exact refresh TX.
      // Only the count is retained; query text, parameters and credentials are not.
      await vi.waitFor(async () => {
        const rows = await observer.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND state = 'active'
            AND wait_event_type = 'Lock'
            AND (query ILIKE '%UPDATE%refresh_tokens%' OR query ILIKE '%pg_advisory_xact_lock%')
            AND ${refreshBackendPid!}::int = ANY(pg_blocking_pids(pid))
        `;
        expect(Number(rows[0]?.count ?? 0)).toBe(1);
      }, { timeout: 5000, interval: 20 });

      allowCommit.release();
      const outcomes = await Promise.all([refreshResult, logoutResult]);
      expect(outcomes).toEqual([{ allowed: true }, { allowed: true }]);
      expect(Boolean(rotated)).toBe(true);

      const activeRefreshTokens = await database.db.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      const accessOutcome = rotated
        ? await safeOutcome(auth.authenticate(rotated.accessToken))
        : { allowed: false };

      // A committed logout must reject the successor, including a request that
      // authenticated with the predecessor before refresh rotated it.
      expect({ activeRefreshTokens, acceptsRotatedAccess: accessOutcome.allowed }).toEqual({
        activeRefreshTokens: all ? 0 : 1,
        acceptsRotatedAccess: false,
      });
      expect((await safeOutcome(auth.authenticate(independent.accessToken))).allowed).toBe(!all);
    } finally {
      // Always unblock before awaiting requests, including observation/assertion
      // failures. Keep cleanup local to the random fixture user.
      allowCommit.release();
      restoreBoundary?.();
      await Promise.allSettled(pending);
      await observer.$disconnect();
      await database.db.refreshToken.deleteMany({ where: { userId: user.id } });
      await database.db.user.deleteMany({ where: { id: user.id } });
    }
  });
});
