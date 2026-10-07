// Compact content fingerprint only. PostgreSQL payload_digest uses jsonb::text instead.
import { createHash } from 'node:crypto';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonical(value: Json): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]!))
        .join(',') +
      '}'
    );
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error('NON_CANONICAL_NUMBER');
  return JSON.stringify(value);
}

export function fingerprint(value: Json): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

export function contentFingerprint(payload: { [key: string]: Json }): string {
  const { ...content } = payload;
  delete content.contentFingerprint;
  return fingerprint(content);
}
