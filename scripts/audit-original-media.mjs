// Read-only storage verification. Signed URLs and credentials never leave this process.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { ConfigService } = require('@nestjs/config');
const { R2MediaStorage } = require(
  fileURLToPath(new URL('../apps/api/dist/modules/content/r2-media.storage.js', import.meta.url)),
);
const storage = new R2MediaStorage(new ConfigService());
const assets = JSON.parse(readFileSync(0, 'utf8'));
const rows = [];
for (const asset of assets) {
  const result = { externalId: asset.externalId, assetId: asset.assetId, sha256: asset.sha256 };
  try {
    const link = await storage.readLink(asset.bucket, asset.objectKey);
    const response = await fetch(typeof link === 'string' ? link : link.url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('HTTP_FAILURE');
    const bytes = Buffer.from(await response.arrayBuffer());
    result.verified =
      bytes.length === asset.byteLength &&
      createHash('sha256').update(bytes).digest('hex') === asset.sha256;
    result.code = result.verified ? 'VERIFIED' : 'MEDIA_BYTES_MISMATCH';
  } catch {
    result.verified = false;
    result.code = 'MEDIA_READ_UNAVAILABLE';
  }
  rows.push(result);
}
console.log(
  JSON.stringify({ assets: rows.length, verified: rows.filter((r) => r.verified).length, rows }),
);
