import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const local = fileURLToPath(new URL('.', import.meta.url));
const other = process.argv[2];
if (!other || !existsSync(other))
  throw new Error('Pass the other repository irt-calibration-v1 directory');
function inventory(root, relative = '') {
  return readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === '__pycache__') return [];
      const name = path.join(relative, entry.name);
      return entry.isDirectory() ? inventory(root, name) : [name];
    })
    .sort();
}
const names = inventory(local);
if (JSON.stringify(names) !== JSON.stringify(inventory(other)))
  throw new Error('Contract file inventories differ');
for (const name of names) {
  const hash = (root) =>
    createHash('sha256')
      .update(readFileSync(path.join(root, name)))
      .digest('hex');
  if (hash(local) !== hash(other)) throw new Error(`Contract content differs: ${name}`);
}
console.log(`Cross-repo byte parity verified: ${names.length} files`);
