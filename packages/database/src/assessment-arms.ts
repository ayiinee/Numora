import type postgres from 'postgres';

type Client = ReturnType<typeof postgres>;

/** Internal main-service primitive. Authorize the student before calling.
 * Unique assignment survives retries, experiment versions and original fallback.
 */
export async function getOrAssignAssessmentArm(
  client: Client,
  input: { setId: string; studentId: string; proposedArmId: string },
) {
  return client.begin(async (tx) => {
    // Serialize before INSERT: ON CONFLICT must not run the assignment guard for an
    // existing assignment after a set closes or an arm is held.
    await tx`select pg_advisory_xact_lock(hashtextextended(${input.setId}||':'||${input.studentId},72))`;
    const [existing] = await tx`select * from public.assessment_arm_assignments
      where set_id=${input.setId}::uuid and student_id=${input.studentId}::uuid`;
    if (existing) return existing;
    const [created] =
      await tx`insert into public.assessment_arm_assignments(set_id,student_id,assigned_arm_id)
      values(${input.setId}::uuid,${input.studentId}::uuid,${input.proposedArmId}::uuid) returning *`;
    return created!;
  });
}

/** Compare-and-swap: a stale admin cannot overwrite a concurrent replacement.
 * Revision guards verify ownership, roster, anchors and immutable content pins.
 */
export async function activateAssessmentArmRevision(
  client: Client,
  input: { armId: string; expectedRevisionId: string | null; revisionId: string },
) {
  return client.begin(async (tx) => {
    const [arm] =
      await tx`select * from public.assessment_arms where id=${input.armId}::uuid for update`;
    if (!arm || arm.current_revision_id !== input.expectedRevisionId)
      throw new Error('ASSESSMENT_ARM_REVISION_CONFLICT');
    const [updated] =
      await tx`update public.assessment_arms set current_revision_id=${input.revisionId}::uuid
      where id=${input.armId}::uuid returning *`;
    return updated!;
  });
}
