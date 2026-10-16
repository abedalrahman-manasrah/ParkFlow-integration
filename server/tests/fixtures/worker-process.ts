// A real worker process; only provider HTTP is redirected to a loopback fixture.
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test') || new URL(process.env.REDIS_URL!).pathname !== '/15') {
  throw new Error('Worker regression fixture requires the dedicated test database and Redis 15');
}
const fixture = process.env.PARKFLOW_TEST_PROVIDER_URL!;
if (!fixture.startsWith('http://127.0.0.1:')) throw new Error('Provider fixture must be loopback');
const externalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  if (url === 'https://exp.host/--/api/v2/push/send') return externalFetch(fixture + '/push', init);
  if (url.startsWith(fixture + '/')) return externalFetch(input, init);
  return Promise.reject(new Error('Unmocked provider boundary in worker regression fixture'));
};
void import('../../src/jobs/worker.js');
export {};
