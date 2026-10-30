'use client';

import { ApiProblem } from '@/lib/api';
import { Button, Dialog } from '@tka/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdminAccessError } from './admin-workspace';
import { createGeneratorPackage, generatorPackageCatalog } from './generator-package-api';
import type { GeneratorPackageCatalogDto, CreateGeneratorPackageDto } from './generated-types';

export const generatorTypeLabels = { TRYOUT: 'Tryout', DRILL: 'Drill', PRETEST: 'Pretest' };
export function generatorError(error: unknown, fallback: string) {
  return error instanceof ApiProblem && error.code === 'GENERATOR_DISABLED'
    ? 'Generator belum diaktifkan pada lingkungan ini.'
    : error instanceof Error
      ? error.message
      : fallback;
}
export function GeneratorCreateDialog({
  open,
  token,
  onClose,
  onCreated,
}: {
  open: boolean;
  token: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const onAccessError = useAdminAccessError();
  const [catalog, setCatalog] = useState<GeneratorPackageCatalogDto | null>(null);
  const [type, setType] = useState<CreateGeneratorPackageDto['assessmentType']>('TRYOUT');
  const [scope, setScope] = useState('');
  const [title, setTitle] = useState('Paket Tryout');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const key = useRef<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setCatalog(null);
    setError('');
    void generatorPackageCatalog(token).then(
      (data) => {
        if (active) {
          setCatalog(data);
          setLoading(false);
        }
      },
      (cause) => {
        if (active) {
          onAccessError(cause);
          setError(generatorError(cause, 'Sumber generator belum dapat dimuat.'));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [open, token, generation, onAccessError]);
  useEffect(() => {
    if (open && error) {
      feedback.current?.focus();
      feedback.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, error]);
  const choices = catalog?.options.filter((option) => option.assessmentType === type) ?? [];
  const choice =
    choices.find((option) => (option.scopeId ?? 'GLOBAL') === scope) ??
    (type === 'TRYOUT' ? choices[0] : undefined);
  async function generate(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || loading || !choice?.canGenerate || !title.trim()) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      key.current ??= crypto.randomUUID();
      const result = await createGeneratorPackage(token, key.current, {
        assessmentType: type,
        title,
        ...(choice.scopeId ? { scopeId: choice.scopeId } : {}),
      });
      if (mounted.current) {
        key.current = null;
        onCreated(result.id);
      }
    } catch (cause) {
      if (mounted.current) {
        onAccessError(cause);
        setError(generatorError(cause, 'Paket belum dapat dibuat. Coba lagi.'));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title="Buat paket generator"
      onClose={onClose}
      pending={busy}
      description="Pilih tujuan dan sumber soal. Hasil dibuat sebagai kandidat untuk diperiksa melalui Impor soal."
      className="admin-management-dialog generator-dialog"
      actions={
        <>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button
            type="submit"
            form="generator-create-form"
            disabled={busy || loading || !choice?.canGenerate || !title.trim()}
            loading={busy}
          >
            Buat paket
          </Button>
        </>
      }
    >
      <form id="generator-create-form" onSubmit={(event) => void generate(event)} aria-busy={busy}>
        {error && (
          <div className="generator-feedback" role="alert" tabIndex={-1} ref={feedback}>
            <p>{error}</p>
            {!catalog && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setGeneration((value) => value + 1)}
              >
                Muat ulang sumber
              </Button>
            )}
          </div>
        )}
        <fieldset disabled={busy} className="generator-fields">
          <label htmlFor="generator-type">Jenis paket</label>
          <select
            id="generator-type"
            value={type}
            onChange={(event) => {
              const next = event.target.value as typeof type;
              setType(next);
              setScope('');
              setTitle(`Paket ${generatorTypeLabels[next]}`);
              key.current = null;
            }}
          >
            {Object.entries(generatorTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor="generator-title">Nama paket</label>
          <input
            id="generator-title"
            value={title}
            maxLength={160}
            required
            onChange={(event) => {
              setTitle(event.target.value);
              key.current = null;
            }}
          />
          {type !== 'TRYOUT' && (
            <>
              <label htmlFor="generator-scope">
                {type === 'DRILL' ? 'Subbab dan level' : 'Bab'}
              </label>
              <select
                id="generator-scope"
                value={scope}
                disabled={loading}
                onChange={(event) => {
                  setScope(event.target.value);
                  key.current = null;
                }}
              >
                <option value="">
                  {loading
                    ? 'Memuat sumber...'
                    : type === 'DRILL'
                      ? 'Pilih subbab dan level'
                      : 'Pilih bab'}
                </option>
                {choices.map((option) => (
                  <option key={option.scopeId} value={option.scopeId ?? ''}>
                    {option.scopeLabel}
                  </option>
                ))}
              </select>
            </>
          )}
          {loading ? (
            <p role="status">Memuat sumber soal yang disetujui...</p>
          ) : choice ? (
            <>
              <dl className="generator-source-summary">
                <div>
                  <dt>Soal per paket</dt>
                  <dd>{choice.requiredCount}</dd>
                </div>
                <div>
                  <dt>Sumber tersedia</dt>
                  <dd>{choice.availableCount}</dd>
                </div>
              </dl>
              <p className="generator-source-note" role="status">
                {choice.canGenerate
                  ? 'Sumber yang dipetakan dan disetujui tersedia untuk paket ini.'
                  : 'Sumber soal belum cukup. Periksa ketersediaan sumber yang dipetakan dan disetujui.'}
              </p>
            </>
          ) : (
            catalog && (
              <p role="status">
                {choices.length
                  ? 'Pilih materi untuk melihat ketersediaan sumber.'
                  : 'Belum ada sumber yang dipetakan dan disetujui untuk jenis paket ini.'}
              </p>
            )
          )}
        </fieldset>
        <p className="generator-footnote">
          Pembuatan kandidat belum menyimpan soal kanonis atau menerbitkan paket. Hasil siap akan
          dibuka pada Preview & tujuan di Impor soal.
        </p>
      </form>
    </Dialog>
  );
}
