import type { Checkpoint, CheckpointStatus } from '@/types';

/**
 * Checkpoints and junctions from the Wusool project. Coordinates come from
 * OpenStreetMap (Zaatara is the one Wusool could not verify there).
 */
export const CHECKPOINTS: Checkpoint[] = [
  {
    id: 'cp_qalandia',
    nameAr: 'حاجز قلنديا',
    nameEn: 'Qalandia Checkpoint',
    location: { latitude: 31.86233, longitude: 35.22743 },
  },
  {
    id: 'cp_container',
    nameAr: 'حاجز الكونتينر',
    nameEn: 'Container Checkpoint',
    location: { latitude: 31.74222, longitude: 35.28928 },
  },
  {
    id: 'cp_atara',
    nameAr: 'حاجز عطارة',
    nameEn: 'Atara Checkpoint',
    location: { latitude: 31.98284, longitude: 35.20056 },
  },
  {
    id: 'cp_beitel',
    nameAr: 'حاجز بيت إيل (الارتباط)',
    nameEn: 'Beit El DCO Checkpoint',
    location: { latitude: 31.923, longitude: 35.22 },
  },
  {
    id: 'cp_jaba',
    nameAr: 'حاجز جبع',
    nameEn: 'Jaba Checkpoint',
    location: { latitude: 31.85392, longitude: 35.2564 },
  },
  {
    id: 'cp_huwara',
    nameAr: 'حاجز حوارة',
    nameEn: 'Huwara Checkpoint',
    location: { latitude: 32.1633, longitude: 35.26316 },
  },
  {
    id: 'cp_zaatara',
    nameAr: 'حاجز زعترة',
    nameEn: 'Zaatara Junction',
    location: { latitude: 32.112, longitude: 35.276 },
  },
  {
    id: 'cp_jalama',
    nameAr: 'حاجز الجلمة',
    nameEn: 'Jalama Checkpoint',
    location: { latitude: 32.50991, longitude: 35.30585 },
  },
];

/**
 * Reports from "other drivers" so the demo opens with live-looking checkpoint
 * status. Re-issued relative to "now" whenever the reports have gone quiet.
 */
export const SEED_REPORTS: { checkpointId: string; status: CheckpointStatus; minutesAgo: number }[] = [
  { checkpointId: 'cp_beitel', status: 'open', minutesAgo: 12 },
  { checkpointId: 'cp_container', status: 'closed', minutesAgo: 18 },
  { checkpointId: 'cp_qalandia', status: 'congested', minutesAgo: 26 },
  { checkpointId: 'cp_atara', status: 'open', minutesAgo: 34 },
  { checkpointId: 'cp_jaba', status: 'closed', minutesAgo: 47 },
  { checkpointId: 'cp_zaatara', status: 'congested', minutesAgo: 52 },
  { checkpointId: 'cp_jalama', status: 'congested', minutesAgo: 70 },
  { checkpointId: 'cp_huwara', status: 'closed', minutesAgo: 95 },
];
