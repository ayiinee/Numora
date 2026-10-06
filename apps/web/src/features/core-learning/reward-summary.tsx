'use client';
import { Card, Icon } from '@tka/ui';
import type { AssessmentXpDetailDto, DrillRewardDto } from './generated-types';

const number = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
export function RewardSummary({
  xp,
  reward,
  detail,
  kind,
}: {
  xp: number | null;
  reward?: DrillRewardDto | null | undefined;
  detail?: AssessmentXpDetailDto | null | undefined;
  kind: 'drill' | 'tryout';
}) {
  const breakdown = detail ?? reward?.detail;
  return (
    <Card className="drill-rewards reward-summary">
      <h2>
        <Icon name="spark" /> XP aktivitas
      </h2>
      {xp !== null ? (
        <>
          <strong className="reward-summary__total">{xp} XP</strong>
          <p>
            {kind === 'tryout'
              ? 'Sudah tercatat sejak pengiriman jawaban. Tanpa bonus waktu.'
              : 'Reward tersimpan untuk attempt ini.'}
          </p>
          <details className="learning-detail">
            <summary>Lihat rincian XP</summary>
            <dl className="drill-rewards__stats" aria-label="Rincian XP tersimpan">
              {breakdown?.fullCorrectCount != null && (
                <div>
                  <dt>Benar penuh</dt>
                  <dd>{number(breakdown.fullCorrectCount)} soal</dd>
                </div>
              )}
              {breakdown?.partialCorrectEquivalent != null && (
                <div>
                  <dt>Benar ekuivalen parsial</dt>
                  <dd>{number(breakdown.partialCorrectEquivalent)}</dd>
                </div>
              )}
              {breakdown?.correctEquivalent != null && (
                <div>
                  <dt>Total benar ekuivalen</dt>
                  <dd>{number(breakdown.correctEquivalent)}</dd>
                </div>
              )}
              {reward && (
                <>
                  <div>
                    <dt>XP dasar</dt>
                    <dd>{number(reward.baseXp)}</dd>
                  </div>
                  <div>
                    <dt>Bonus kecepatan</dt>
                    <dd>{number(reward.bonusXp)}</dd>
                  </div>
                  <div>
                    <dt>Waktu pengerjaan</dt>
                    <dd>{number(reward.durationSeconds)} detik</dd>
                  </div>
                </>
              )}
            </dl>
            {!reward && !breakdown && <p>Rincian kontribusi tidak tercatat pada hasil ini.</p>}
            {breakdown?.calculationMode === 'FULL_CORRECT_FALLBACK' && (
              <p role="note">
                XP hanya menghitung jawaban benar penuh karena kontribusi parsial tidak dapat
                dihitung saat submit.
                {breakdown.fallbackReason && <> {breakdown.fallbackReason}</>} Ini terpisah dari
                metode nilai TryOut.
              </p>
            )}
          </details>
        </>
      ) : (
        <p>XP tidak tercatat pada kebijakan attempt lama; nilai akademik tetap tersimpan.</p>
      )}
    </Card>
  );
}
