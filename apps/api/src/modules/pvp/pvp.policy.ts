import { ConflictException } from '@nestjs/common';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const PVP_POLICY = Symbol('PVP_POLICY');
export type PvpMode = 'disabled' | 'demo' | 'official';
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
