import { describe, expect, it } from 'vitest';
import { presentFixtureText } from './fixture-presentation.js';
import { fixturePresentationManifest } from './fixture-presentation-manifest.js';

describe('verified fixture presentation', () => {
  it('requires both the verified UUID and the exact original field', () => {
    for (const [id, fields] of Object.entries(fixturePresentationManifest)) {
      for (const field of ['name', 'stem', 'explanation'] as const) {
        const entry = fields[field];
        if (!entry) continue;
        expect(presentFixtureText(id, field, entry.original)).toBe(entry.replacement);
        expect(presentFixtureText('unknown', field, entry.original)).toBe(entry.original);
        expect(presentFixtureText(id, field, `${entry.original}!`)).toBe(`${entry.original}!`);
      }
    }
  });
});
