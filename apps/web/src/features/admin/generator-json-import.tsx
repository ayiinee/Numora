'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card } from '@tka/ui';
import { AdminFrame, AdminMessage } from './admin-presentation';
import { GeneratorFilePreview, generatorTypeLabels, useGeneratorToken } from './generator-packages';
import {
  getGeneratorPackageFile,
  importGeneratorJson,
  validateGeneratorJson,
} from './generator-package-api';
import type { GeneratorJsonPreviewDto, GeneratorPackageFileDto } from './generated-types';
export function GeneratorJsonImportScreen() {
  const token = useGeneratorToken();
  const [file, setFile] = useState<GeneratorPackageFileDto | null>(null),
    [preview, setPreview] = useState<GeneratorJsonPreviewDto | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengimpor JSON.');
    } finally {
      setBusy(false);
    }
  }
  async function inspect(json: GeneratorPackageFileDto) {
    setFile(null);
    setPreview(null);
    setSaved(false);
    if (!token) return;
    if (
      json.contractVersion !== 'numora-generator-package-v1' ||
      typeof json.generatorPackageId !== 'string'
    )
      throw new Error('Gunakan JSON paket asli dari Hasil generator.');
    const result = await validateGeneratorJson(token, json.generatorPackageId, json);
    setFile(result.file);
    setPreview(result);
    setSaved(false);
  }
  useEffect(() => {
    if (!token) return;
    const id = new URLSearchParams(window.location.search).get('generatorPackage');
    if (id) void run(async () => inspect(await getGeneratorPackageFile(token, id)));
  }, [token]);
  return (
    <AdminFrame
      title="Impor soal JSON"
      description="Buka JSON generator, lihat preview, validasi, lalu simpan paket DRAFT."
      icon="book"
    >
      <nav className="admin-content-actions">
        <Link href="/admin/content/imports">Impor Excel</Link>
        <Link href="/admin/content/generator/results">Hasil generator</Link>
      </nav>
      {!token ? (
        <AdminMessage message="Akses Content Admin diperlukan." />
      ) : (
        <>
          {error && <AdminMessage message={error} error />}
          {saved && <p role="status">Paket dan seluruh soal tersimpan sebagai DRAFT.</p>}
          <Card className="admin-generator-form">
            <label htmlFor="generator-json-file">File paket JSON</label>
            <input
              id="generator-json-file"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected)
                  void run(async () => {
                    setFile(null);
                    setPreview(null);
                    setSaved(false);
                    if (selected.size > 2 * 1024 * 1024) throw new Error('JSON maksimal 2 MiB.');
                    await inspect(JSON.parse(await selected.text()) as GeneratorPackageFileDto);
                  });
              }}
            />
            <p>
              File diverifikasi terhadap kandidat, lineage dan approval aslinya. Isi, kunci,
              kategori, jumlah dan scope mengikuti validasi impor soal. Mengubah JSON hasil
              generator ditolak; revisi dilakukan sebagai versi baru setelah impor.
            </p>
            {file && (
              <>
                <h2>{file.title}</h2>
                <p>
                  {generatorTypeLabels[file.assessmentType]} · {file.expectedCount} soal
                </p>
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      setPreview(await validateGeneratorJson(token, file.generatorPackageId, file));
                    })
                  }
                >
                  Validasi JSON
                </Button>
                <Button
                  disabled={busy || !preview?.report.canImportDraft || saved}
                  loading={busy}
                  onClick={() =>
                    void run(async () => {
                      await importGeneratorJson(token, file.generatorPackageId, file);
                      setSaved(true);
                    })
                  }
                >
                  Simpan paket DRAFT
                </Button>
              </>
            )}
            {preview && (
              <p role="status">
                {preview.report.canImportDraft
                  ? 'Validasi lulus. Siap disimpan sebagai DRAFT.'
                  : 'Validasi belum lulus.'}
              </p>
            )}
            {preview?.report.items
              .filter((i) => i.blockers.length)
              .map((i) => (
                <p role="alert" key={i.externalId}>
                  {i.externalId}: {i.blockers.join(', ')}
                </p>
              ))}
          </Card>
          {preview && <GeneratorFilePreview file={preview.file} />}
        </>
      )}
    </AdminFrame>
  );
}
