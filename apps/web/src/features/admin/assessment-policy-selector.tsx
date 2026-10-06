'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/onboarding/auth';
import { apiRequest } from '@/lib/api';
import type { AdminAssessmentPoliciesDto } from './generated-types';
export function AssessmentPolicySelector({
  token,
  type,
  defaultValue = '',
}: {
  token: string;
  type: 'DRILL' | 'TRYOUT';
  defaultValue?: string;
}) {
  const { state } = useAuth();
  const profile = state.status === 'ready' ? state.profile : null;
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState<{
    data?: AdminAssessmentPoliciesDto;
    status: 'pending' | 'success' | 'error';
  }>({ status: 'pending' });
  useEffect(() => {
    let active = true;
    setQuery({ status: 'pending' });
    void apiRequest<AdminAssessmentPoliciesDto>('admin/content/assessment-policies', token).then(
      (data) => {
        if (active) setQuery({ data, status: 'success' });
      },
      () => {
        if (active) setQuery({ status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [token, profile?.id, profile?.adminRole, revision]);
  const items = query.data?.items.filter((policy) => policy.assessmentType === type) ?? [];
  return (
    <div>
      <label>
        Versi kebijakan penilaian
        <select
          key={`${type}:${defaultValue}:${query.status}`}
          name="scoringPolicyVersionId"
          required
          defaultValue={defaultValue}
        >
          <option value="">Pilih versi published yang disahkan</option>
          {items.map((policy) => (
            <option value={policy.id} key={policy.id}>
              {policy.code} v{policy.version} · disahkan{' '}
              {policy.approvedAt
                ? new Date(policy.approvedAt).toLocaleDateString('id-ID')
                : 'keputusan Product v0.6'}
            </option>
          ))}
        </select>
      </label>
      {query.status === 'pending' && <p role="status">Memuat policy…</p>}
      {query.status === 'error' && (
        <p role="alert">
          Policy belum bisa dimuat.{' '}
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            Coba lagi
          </button>
        </p>
      )}
      {query.status === 'success' && !items.length && (
        <p role="status">
          Belum ada policy published yang disahkan. Lengkapi persetujuan Product/Curriculum sebelum
          publikasi.
        </p>
      )}
      {!!items.length && (
        <details>
          <summary>Bukti persetujuan versi</summary>
          {items.map((policy) => (
            <p key={policy.id}>
              {policy.code} v{policy.version}: {policy.approvalReference}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
