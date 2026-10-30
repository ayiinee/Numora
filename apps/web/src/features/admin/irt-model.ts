import type { IrtRequestDto } from './generated-types';
export { snapshotTime as irtTime } from './analytics-model';

export const irtReasons: Record<string, { label: string; next: string }> = {
  CONFIGURATION_APPROVALS_MISSING: {
    label: 'Konfigurasi yang disahkan belum lengkap.',
    next: 'Periksa versi model IRT dan quality gate bersama Data/AI.',
  },
  IRT_DATASET_EMPTY: {
    label: 'Belum ada respons selesai untuk dianalisis.',
    next: 'Periksa data pengerjaan dan finalisasi batch.',
  },
  IRT_V3_DISABLED: {
    label: 'Analisis IRT belum diaktifkan pada environment ini.',
    next: 'Riwayat tetap dapat dibaca. Hubungi pengelola environment untuk aktivasi.',
  },
  MEASUREMENT_CONTEXT_MISSING: {
    label: 'Konteks pengukuran belum tersedia.',
    next: 'Tunggu atau periksa handoff konteks dari Data/AI.',
  },
  BATCH_NOT_CLOSED: {
    label: 'Batch belum ditutup.',
    next: 'Tunggu penutupan batch oleh proses server.',
  },
  ATTEMPTS_NOT_FINALIZED: {
    label: 'Masih ada pengerjaan yang belum difinalisasi.',
    next: 'Periksa proses finalisasi sebelum menyiapkan analisis.',
  },
  SCIENTIFIC_PACKAGE_NOT_FROZEN: {
    label: 'Paket ilmiah belum dibekukan.',
    next: 'Periksa freeze dan quality gate bersama Data/AI.',
  },
  RELEASE_POLICY_NOT_APPROVED: {
    label: 'Kebijakan rilis belum disahkan.',
    next: 'Periksa persetujuan kebijakan rilis bersama pemilik proses.',
  },
  SEALED_RUBRIC_MISSING: {
    label: 'Rubrik yang disahkan belum lengkap.',
    next: 'Periksa kelengkapan rubrik bersama pemilik konten.',
  },
  SCIENTIFIC_ARTIFACT_NOT_ADOPTED: {
    label: 'Evidence ilmiah belum diadopsi.',
    next: 'Tinjau request dan hasil komputasi. Adopsi tetap diperiksa oleh server.',
  },
  RESPONDENT_CONTRACT_NOT_APPROVED: {
    label: 'Kontrak hasil peserta dan mapping menunggu pengesahan Data.',
    next: 'Tunggu handoff Data/AI; komputasi berhasil atau adopsi belum membuka hasil peserta.',
  },
};
export function irtReason(code: string) {
  return (
    irtReasons[code] ?? {
      label: code,
      next: 'Periksa kode ini bersama pengelola. Aturan tetap mengikuti server.',
    }
  );
}
const statuses: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Menunggu', tone: 'neutral' },
  RUNNING: { label: 'Diproses', tone: 'info' },
  COMPLETED: { label: 'Request selesai', tone: 'success' },
  FAILED: { label: 'Gagal', tone: 'warning' },
  CANCELLED: { label: 'Dibatalkan', tone: 'neutral' },
  SUCCEEDED: { label: 'Komputasi berhasil', tone: 'success' },
  EXPIRED: { label: 'Waktu eksekusi habis', tone: 'warning' },
  OPEN: { label: 'Terbuka', tone: 'info' },
  CLOSED: { label: 'Ditutup', tone: 'neutral' },
  PLANNED: { label: 'Direncanakan', tone: 'neutral' },
};
export const irtStatus = (code: string) => statuses[code] ?? { label: code, tone: 'neutral' };
export const irtReference = (value: string) => (value.length > 12 ? value.slice(-8) : value);
// Only presentation eligibility; the endpoint rechecks the current durable state.
export function irtCanRetry(request: IrtRequestDto) {
  return (
    !request.acceptedExecutionId &&
    request.status !== 'COMPLETED' &&
    request.status !== 'CANCELLED' &&
    Boolean(
      request.status === 'FAILED' ||
      request.execution?.status === 'FAILED' ||
      request.execution?.leaseExpired,
    )
  );
}
export function irtCanAdopt(request: IrtRequestDto) {
  return (
    !request.acceptedExecutionId &&
    request.status === 'RUNNING' &&
    request.execution?.status === 'SUCCEEDED'
  );
}
