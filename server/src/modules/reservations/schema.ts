import { z } from 'zod';
import { id } from '../../apiRegistry';

export const createReservationInput = z.object({
  zoneId: id,
  spotId: id,
  startTime: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(30).max(480).refine((value) => value % 30 === 0, 'Use 30-minute increments'),
}).strict();

export const validateQrInput = z.object({
  token: z.string().trim().min(20).max(500),
}).strict();
