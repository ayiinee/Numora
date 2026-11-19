export type TryoutAnswer =
  | { optionId: string }
  | { optionIds: string[] }
  | { categoryByStatementId: Record<string, string> };

/** Stable, human-readable answer key for the browser print view. */
export function formatTryoutAnswer(answer: TryoutAnswer | null | undefined): string {
  if (!answer) return '—';
  if ('optionId' in answer) return answer.optionId;
  if ('optionIds' in answer) return answer.optionIds.join(', ');
  return Object.entries(answer.categoryByStatementId)
    .map(([statementId, category]) => `${statementId}: ${category}`)
    .join('; ');
}
