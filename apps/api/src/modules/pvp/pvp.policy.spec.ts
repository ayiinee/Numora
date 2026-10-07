import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pvpPoints, durationSeconds, pvpContentMode } from './pvp.policy';
import { PvpEngineService } from './pvp-engine.service';
import { validateCommand } from './pvp.protocol';

describe('PvP policy and boundaries', () => {
  it('defaults to strict content and permits temporary content only in explicit DEMO mode', () => {
    expect(pvpContentMode({})).toBe('strict');
    expect(pvpContentMode({ PVP_MODE: 'official' })).toBe('strict');
    expect(pvpContentMode({ PVP_MODE: 'demo', PVP_CONTENT_MODE: 'temporary-owner-accepted' })).toBe(
      'temporary-owner-accepted',
    );
    for (const mode of [undefined, 'disabled', 'official'])
      expect(() =>
        pvpContentMode({ PVP_MODE: mode, PVP_CONTENT_MODE: 'temporary-owner-accepted' }),
      ).toThrow('requires PVP_MODE=demo');
    expect(() => pvpContentMode({ PVP_MODE: 'demo', PVP_CONTENT_MODE: 'anything' })).toThrow();
  });
  it('keeps real accounts gated without an approved policy', async () => {
    const engine = new PvpEngineService(null);
    expect((await engine.availability()).available).toBe(false);
    for (const action of [
      engine.create(randomUUID(), 'easy', randomUUID()),
      engine.ready(randomUUID(), randomUUID()),
      engine.invite(randomUUID(), randomUUID(), randomUUID()),
    ])
      await expect(action).rejects.toMatchObject({
        response: { code: 'PVP_POLICY_OPEN' },
        status: 409,
      });
  });
  it('uses server durations and floors the speed bonus at boundaries', () => {
    expect(['easy', 'medium', 'hard'].map((d) => durationSeconds(d as 'easy'))).toEqual([
      30, 45, 60,
    ]);
    expect(pvpPoints(true, 15001, 30000)).toEqual({ basePoints: 100, speedBonus: 25 });
    expect(pvpPoints(true, -1, 30000).speedBonus).toBe(0);
    expect(pvpPoints(true, 30001, 30000).speedBonus).toBe(50);
    expect(pvpPoints(false, 30000, 30000)).toEqual({ basePoints: 0, speedBonus: 0 });
  });
  it('rejects unknown fields, invalid versions, spoofed events and missing request IDs', () => {
    const base = {
      event: 'answer:submit',
      eventVersion: '1',
      requestId: randomUUID(),
      sentAt: new Date().toISOString(),
      payload: { matchId: randomUUID(), questionId: randomUUID(), optionId: 'A' },
    };
    expect(validateCommand('answer:submit', base).payload.optionId).toBe('A');
    expect(() =>
      validateCommand('room:create', {
        ...base,
        event: 'room:create',
        payload: { difficulty: ['easy'] },
      }),
    ).toThrow();
    expect(() =>
      validateCommand('answer:submit', { ...base, sentAt: '2026-02-30T00:00:00Z' }),
    ).toThrow();
    for (const value of [
      { ...base, eventVersion: '2' },
      { ...base, requestId: undefined },
      { ...base, event: 'room:create' },
      { ...base, payload: { ...base.payload, score: 150 } },
      { ...base, token: 'extra' },
      { ...base, payload: { ...base.payload, optionId: {} } },
    ])
      expect(() => validateCommand('answer:submit', value)).toThrow();
  });
});
