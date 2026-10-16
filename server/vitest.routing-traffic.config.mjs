// Routing and Google traffic transport fixtures require no database, Redis or live providers.
export default { test: { include: ['tests/routing-traffic.test.ts'] } };
