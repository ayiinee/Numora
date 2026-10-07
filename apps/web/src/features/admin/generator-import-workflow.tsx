'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { ContentImportSteps } from './content-import-steps';
import { GeneratorFilePreview, generatorTypeLabels, useGeneratorToken } from './generator-packages';
import {
  getGeneratorPackageFile,
  validateGeneratorJson,
  importGeneratorJson,
} from './generator-package-api';
import { downloadFile } from './content-excel-api';
import type {
  GeneratorPackageFileDto,
  GeneratorJsonPreviewDto,
  ContentPackageDetailDto,
} from './generated-types';
export function GeneratorImportWorkflow({ id }: { id: string }) {
  const token = useGeneratorToken();
  const { state } = useAuth();
  const [file, setFile] = useState<GeneratorPackageFileDto | null>(null),
    [preview, setPreview] = useState<GeneratorJsonPreviewDto | null>(null),
    [pack, setPack] = useState<ContentPackageDetailDto | null>(null),
    [step, setStep] = useState(2),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const root = `admin/content/generator/packages/${id}`;
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (!token) return;
    setFile(await getGeneratorPackageFile(token, id));
  }
  useEffect(() => {
    setFile(null);
    setStep(2);
    setPreview(null);
    setPack(null);
    void run(load);
  }, [token, id]);
  async function validate() {
    if (!token || !file) return;
    const checked = await validateGeneratorJson(token, id, file);
    setPreview(checked);
    return checked;
  }
  async function detail() {
    if (!token) return;
    setPack(await apiRequest<ContentPackageDetailDto>(`${root}/content-package`, token));
  }
  return (
    <AdminFrame
      title="Impor soal"
      description="Periksa soal, tujuan dan validasi, lalu lanjutkan ke draft dan Publish."
      icon="book"
    >
      <nav className="upload-tabs">
        <Link href="/admin/content/generator">Generator paket</Link>
        <Link href="/admin/content/imports">Upload soal</Link>
      </nav>
      {error && <AdminMessage message={error} error retry={() => void run(load)} />}
      {!token ? (
        state.status === 'loading' ? (
          <AdminLoading message="Memeriksa akses…" />
        ) : (
          <AdminMessage
            message="Akses Super Admin atau Content/Data/Moderation diperlukan."
            login={state.status === 'signed_out'}
          />
        )
      ) : !file ? (
        <AdminLoading message="Membuka hasil generator pada preview…" />
      ) : (
        <div className="content-upload-workflow">
          <ContentImportSteps step={step} />
          <div className="upload-file-summary">
            <strong>{file.title}</strong>
            <span>Hasil generator · {file.expectedCount} soal</span>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                downloadFile(
                  new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
                  `generator-${id}.json`,
                )
              }
            >
              Unduh JSON
            </Button>
          </div>
          {step === 2 && (
            <section className="upload-panel">
              <h2>2. Preview dan tujuan</h2>
              <p>
                Hasil generator sudah dimuat. Periksa seluruh soal, kunci dan pembahasan sebelum
                melanjutkan.
              </p>
              <GeneratorFilePreview file={file} />
              <div className="upload-fields">
                <label>
                  Jenis paket
                  <select value={file.assessmentType} disabled>
                    {Object.entries(generatorTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Judul paket
                  <input value={file.title} readOnly />
                </label>
              </div>
              <p>
                Tujuan, materi dan konten mengikuti paket yang digenerate. Perubahan konten
                dilakukan melalui versi baru setelah impor agar asal soal tetap utuh.
              </p>
              <div className="upload-actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await validate();
                    })
                  }
                >
                  Validasi preview
                </Button>
                <Button
                  disabled={busy}
                  loading={busy}
                  onClick={() =>
                    void run(async () => {
                      await validate();
                      setStep(3);
                    })
                  }
                >
                  Lanjutkan ke pemetaan
                </Button>
              </div>
            </section>
          )}
          {step === 3 && (
            <section className="upload-panel">
              <h2>3. Pemetaan dan validasi</h2>
              <p>
                {file.items.length}/{file.expectedCount} soal. Materi mengikuti original yang dipin
                pada generator.
              </p>
              <p>
                {preview?.report.canImportDraft
                  ? 'Validasi lulus. Paket siap disimpan sebagai DRAFT.'
                  : 'Validasi belum lulus.'}
              </p>
              {preview?.report.items.flatMap((i) =>
                i.blockers.map((code) => (
                  <p role="alert" key={i.externalId + code}>
                    {i.externalId}: {code}
                  </p>
                )),
              )}
              <div className="upload-actions">
                <Button variant="secondary" disabled={busy} onClick={() => setStep(2)}>
                  Kembali ke preview
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await validate();
                    })
                  }
                >
                  Validasi ulang
                </Button>
                <Button
                  disabled={busy || !preview?.report.canImportDraft}
                  loading={busy}
                  onClick={() =>
                    void run(async () => {
                      const checked = await validate();
                      if (!checked?.report.canImportDraft) throw new Error('Validasi belum lulus.');
                      await importGeneratorJson(token, id, file);
                      setStep(4);
                      await detail();
                    })
                  }
                >
                  Simpan draft
                </Button>
              </div>
            </section>
          )}
          {step === 4 && (
            <section className="upload-panel">
              <h2>4. Periksa dan Publish</h2>
              <p role="status">Paket dan seluruh soal tersimpan sebagai DRAFT.</p>
              {!pack ? (
                <Button onClick={() => void run(detail)} disabled={busy}>
                  Muat pemeriksaan paket
                </Button>
              ) : (
                <>
                  <dl className="upload-package-summary">
                    <div>
                      <dt>Judul</dt>
                      <dd>{pack.name}</dd>
                    </div>
                    <div>
                      <dt>Jenis</dt>
                      <dd>{generatorTypeLabels[pack.assessmentType]}</dd>
                    </div>
                    <div>
                      <dt>Jumlah soal</dt>
                      <dd>
                        {pack.items.length}/{pack.readiness.expectedCount}
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{pack.status}</dd>
                    </div>
                  </dl>
                  <ul className="upload-checklist">
                    {pack.readiness.checks.map((c) => (
                      <li key={c.code}>
                        <span className={c.passed ? 'is-valid' : 'is-pending'}>
                          {c.passed ? 'Lolos' : 'Belum'}
                        </span>
                        {c.detail}
                      </li>
                    ))}
                  </ul>
                  {pack.status === 'DRAFT' && (
                    <>
                      <p>
                        Publish mengikuti pemeriksaan, review dan persetujuan Curriculum yang
                        berlaku.
                      </p>
                      <label className="upload-confirm">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          disabled={busy}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        Saya telah meninjau isi, kunci, pembahasan dan persetujuan Curriculum.
                      </label>
                      <Button
                        disabled={busy || !confirmed || !pack.readiness.canPublish}
                        loading={busy}
                        onClick={() =>
                          void run(async () => {
                            await apiRequest(`${root}/publish`, token, {
                              method: 'POST',
                              body: JSON.stringify({
                                expectedRevision: pack.contentRevision,
                                confirmed: true,
                              }),
                            });
                            await detail();
                          })
                        }
                      >
                        Publish
                      </Button>
                    </>
                  )}
                </>
              )}
              <div className="upload-actions">
                <Button variant="secondary" disabled={busy} onClick={() => setStep(2)}>
                  Lihat preview
                </Button>
                <Link href="/admin/content/generator">Kembali ke generator paket</Link>
              </div>
            </section>
          )}
        </div>
      )}
    </AdminFrame>
  );
}
