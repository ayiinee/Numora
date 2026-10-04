import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const roots = [
  'packages/contracts/questions',
  'packages/contracts/events',
  'packages/contracts/websocket',
  'packages/contracts/compute',
];

export async function loadContractValidators(directories = roots) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const files = [];
  for (const root of directories) {
    for (const name of (await readdir(root)).sort()) {
      if (extname(name) !== '.json') continue;
      const file = join(root, name);
      ajv.addSchema(JSON.parse(await readFile(file, 'utf8')), file);
      files.push(file);
    }
  }
  if (files.length === 0) throw new Error('No contract JSON schemas were found.');
  return new Map(files.map((file) => [file, ajv.getSchema(file)]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const validators = await loadContractValidators();
  for (const file of validators.keys()) console.log(`valid JSON Schema: ${file}`);
  console.log(`Validated and compiled ${validators.size} contract schema(s). Payload rules remain limited to the committed schemas.`);
}
