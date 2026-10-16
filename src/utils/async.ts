export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Simulates realistic network latency in the mock services. */
export const networkDelay = (min = 260, max = 620) =>
  sleep(min + Math.random() * (max - min));
