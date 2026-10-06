import { sql } from 'drizzle-orm';
import type { AdminTransaction } from '../audit/admin-mutation';
// Editorial pins are distinct from scientific frozen packages, which retain their compute quality gate.
export async function editorialPackageDigest(tx: AdminTransaction, id: string) {
  const [row] = await tx.execute<{ digest: string }>(
    sql`select irt_compute.payload_digest(jsonb_build_object('packageId', ${id}::uuid, 'items', (select jsonb_agg(to_jsonb(i) order by i.display_order, i.id) from public.package_items i where i.package_id=${id}::uuid))) as digest`,
  );
  return row!.digest;
}
