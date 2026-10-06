// Clears Next-generated route types before `next typegen` regenerates them.
// Without this, stale or partially written files in `.next/dev/types` survive a
// merge and surface as bogus TS1128/TS1005 errors in `tsc --noEmit`.
import { rmSync } from 'node:fs';
import { join } from 'node:path';

rmSync(join(process.cwd(), '.next', 'dev', 'types'), { recursive: true, force: true });
