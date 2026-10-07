import { ConflictException } from '@nestjs/common';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const PVP_POLICY = Symbol('PVP_POLICY');
export type PvpMode = 'disabled' | 'demo' | 'official';
export type PvpContentMode = 'strict' | 'temporary-owner-accepted';
export const TEMPORARY_PVP_CONTENT_NOTICE =
  'Soal sementara belum dibedakan menurut tingkat kesulitan. Pilihan Mudah, Sedang, dan Sulit mengatur waktu 30, 45, dan 60 detik per soal.';
export function pvpContentMode(env: NodeJS.ProcessEnv = process.env): PvpContentMode {
  const mode = env.PVP_CONTENT_MODE ?? 'strict';
  if (mode !== 'strict' && mode !== 'temporary-owner-accepted')
    throw new Error('PVP_CONTENT_MODE must be strict or temporary-owner-accepted.');
  if (mode === 'temporary-owner-accepted' && env.PVP_MODE !== 'demo')
    throw new Error('Temporary PvP content requires PVP_MODE=demo.');
  return mode;
}
export function pvpMode(env: NodeJS.ProcessEnv = process.env): PvpMode {
  const mode = env.PVP_MODE ?? 'disabled';
  if (mode !== 'disabled' && mode !== 'demo' && mode !== 'official')
    throw new Error('PVP_MODE must be disabled, demo or official.');
  return mode;
}
export interface PvpPolicy {
  policyVersionId: string;
  roomLifetimeSeconds: number;
  inviteLifetimeSeconds: number;
  simultaneousDisconnect: 'cancel' | 'earliest-deadline-or-cancel';
  mode?: 'demo' | 'official';
}
export function requirePvpPolicy(policy: PvpPolicy | null): PvpPolicy {
  if (!policy)
    throw new ConflictException({ code: 'PVP_POLICY_OPEN', detail: 'PvP belum tersedia.' });
  return policy;
}
export const durationSeconds = (difficulty: Difficulty) =>
  ({ easy: 30, medium: 45, hard: 60 })[difficulty];
export function pvpPoints(correct: boolean, remainingMs: number, durationMs: number) {
  return correct
    ? {
        basePoints: 100,
        speedBonus: Math.floor((50 * Math.max(0, Math.min(remainingMs, durationMs))) / durationMs),
      }
    : { basePoints: 0, speedBonus: 0 };
}
