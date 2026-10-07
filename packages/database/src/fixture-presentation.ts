import { fixturePresentationManifest } from './fixture-presentation-manifest.js';

/** Checked branding overrides apply to output only, after content validation. */
export function presentFixtureText(
  id: string | undefined,
  field: 'name' | 'stem' | 'explanation',
  value: string,
): string {
  const override = id ? fixturePresentationManifest[id]?.[field] : undefined;
  return override?.original === value ? override.replacement : value;
}
