'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@tka/ui';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { ManualQuestionFields } from './manual-question-fields';
import { ContentPayload } from './content-payload';
import { MediaUpload } from './media-upload';
import { getContentVersionMedia } from './content-lifecycle-api';
import { getContentPackage } from './content-package-api';
import { importContent, validateImport } from './content-preview-api';
import { assessmentPath } from './assessment-routes';
import type {
  ContentVersionDetailDto,
  ContentPackageDetailDto,
  ContentVersionMediaLinkDto,
  ImportBodyDto,
  ImportIssueDto,
} from './generated-types';

export function QuestionEditorScreen({
  id,
  packageId,
}: {
  id: string;
  packageId?: string | undefined;
}) {
  const { state } = useAuth();
  const token =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.status === 'ACTIVE' &&
    state.profile.capabilities?.includes('CONTENT_MANAGE')
      ? state.session.access_token
      : null;
  const [detail, setDetail] = useState<ContentVersionDetailDto | null>(null);
  const [pack, setPack] = useState<ContentPackageDetailDto | null>(null);
  const [media, setMedia] = useState<ContentVersionMediaLinkDto[]>([]);
  const [json, setJson] = useState('');
  const [saved, setSaved] = useState('');
  const [tab, setTab] = useState<'content' | 'metadata' | 'media'>('content');
  const [preview, setPreview] = useState(false);
  const [newMediaPlacement, setNewMediaPlacement] = useState('STEM');
  const [newMediaAlt, setNewMediaAlt] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issues, setIssues] = useState<ImportIssueDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const operation = useRef<string | null>(null);
  const navigatingAfterSave = useRef(false);
  const dirty = json !== saved;
  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      apiRequest<ContentVersionDetailDto>(
        `admin/content/versions/${encodeURIComponent(id)}`,
        token,
      ),
      packageId ? getContentPackage(token, packageId) : Promise.resolve(null),
    ])
      .then(([version, source]) => {
        if (!active) return;
        setDetail(version);
        setPack(source);
        const value = JSON.stringify(version.payload, null, 2);
        setJson(value);
        setSaved(value);
        void getContentVersionMedia(token, id).then(
          (links) => {
            if (active) setMedia(links?.items ?? []);
          },
          () => {
            if (active) setError('Gambar belum dapat dimuat. Coba muat ulang gambar di pratinjau.');
          },
        );
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, id, packageId, retry]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (navigatingAfterSave.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const leave = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a');
      if (
        link &&
        link.target !== '_blank' &&
        !link.hasAttribute('download') &&
        !window.confirm('Perubahan belum disimpan. Tinggalkan halaman?')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', leave, true);
    };
  }, [dirty]);
  const payload = json ? (JSON.parse(json) as Record<string, unknown>) : {};
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  const assets = (Array.isArray(metadata.assetManifest) ? metadata.assetManifest : []) as Record<
    string,
    unknown
  >[];
  const editable = Boolean(detail?.sourceNamespace && detail.status !== 'ARCHIVED');
  const back = pack
    ? `${assessmentPath(pack.assessmentType)}/${encodeURIComponent(pack.id)}`
    : '/admin/content';
  const change = (value: string) => {
    setJson(value);
    operation.current = null;
    setNotice('');
  };
  async function save() {
    if (!token || !detail || busy) return;
    setBusy(true);
    setError('');
    setIssues([]);
    try {
      const question = JSON.parse(json) as Record<string, unknown>;
      const body: ImportBodyDto = {
        sourceNamespace: detail.sourceNamespace!,
        questions: [question],
        expectedSourceVersionId: detail.id,
        revisionReason: 'Penyuntingan melalui editor soal',
      };
      if (pack?.status === 'DRAFT') {
        const item = pack.items.find((item) => item.questionVersionId === id);
        if (!item) throw Error('Soal dalam paket sudah berubah. Buka ulang detail paket.');
        question.metadata = { ...metadata, sourceOrder: item.displayOrder };
        body.target = { packageId: pack.id, expectedRevision: pack.contentRevision };
      }
      const checked = await validateImport(token, body);
      setIssues(checked.items.flatMap((item) => item.issues ?? []));
      if (!checked.canImportDraft)
        throw Error(
          checked.items.flatMap((item) => item.blockers).join(', ') ||
            'Periksa kelengkapan soal sebelum menyimpan.',
        );
      operation.current ??= crypto.randomUUID();
      const result = await importContent(token, body, operation.current);
      const next = result.items[0]?.questionVersionId;
      if (!next) throw Error('Versi soal belum tersimpan. Coba kembali.');
      setSaved(json);
      navigatingAfterSave.current = true;
      if (next !== id)
        window.location.assign(
          `/admin/content/versions/${encodeURIComponent(next)}/edit${pack?.status === 'DRAFT' ? `?package=${encodeURIComponent(pack.id)}` : ''}`,
        );
      else setNotice('Tidak ada perubahan isi; versi baru tidak dibuat.');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Penyimpanan gagal. Perubahan masih tersedia di editor.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFrame title="Edit soal" description="" icon="book" management fullWidth minimalHeader>
      <div className="question-editor-page">
        <header className="question-editor-header">
          <div>
            <Link href={back}>← {pack ? 'Kembali ke paket' : 'Kembali ke bank soal'}</Link>
            <h2>Edit soal</h2>
            <p>
              {String(payload.externalId ?? id)} · Versi {detail?.versionNumber ?? '—'}
              {dirty ? ' · Perubahan belum disimpan' : ''}
            </p>
          </div>
          <Button onClick={() => void save()} disabled={!editable || !dirty || busy}>
            {busy
              ? 'Menyimpan...'
              : pack?.status === 'DRAFT'
                ? 'Simpan perubahan'
                : 'Simpan sebagai revisi baru'}
          </Button>
        </header>
        {!token ? (
          <AdminMessage message="Akses pengelolaan konten diperlukan." login />
        ) : loading ? (
          <AdminLoading message="Memuat soal..." />
        ) : (
          <>
            {error && (
              <AdminMessage
                error
                message={error}
                {...(!detail ? { retry: () => setRetry((value) => value + 1) } : {})}
              />
            )}
            {notice && <p role="status">{notice}</p>}
            {detail && (
              <>
                {!editable && (
                  <AdminMessage
                    message={
                      detail.status === 'ARCHIVED'
                        ? 'Soal diarsipkan dan tidak dapat diedit.'
                        : 'Soal lama ini belum mendukung penyuntingan melalui jalur impor. Buat revisi melalui bank soal.'
                    }
                  />
                )}
                {pack && pack.status !== 'DRAFT' && (
                  <p className="question-editor-note">
                    Paket sudah dikunci. Penyimpanan membuat versi soal baru di bank soal; isi paket
                    dan pengerjaan sebelumnya tetap. Gunakan versi baru pada revisi paket
                    berikutnya.
                  </p>
                )}
                <div className="question-editor-layout">
                  <Card className="question-editor-form">
                    <div
                      role="tablist"
                      aria-label="Bagian editor soal"
                      className="question-editor-tabs"
                    >
                      {(['content', 'metadata', 'media'] as const).map((key) => (
                        <button
                          key={key}
                          id={`editor-tab-${key}`}
                          type="button"
                          role="tab"
                          aria-selected={tab === key}
                          aria-controls={`editor-panel-${key}`}
                          tabIndex={tab === key ? 0 : -1}
                          onKeyDown={(event) => {
                            const keys = ['content', 'metadata', 'media'] as const;
                            const index = keys.indexOf(key);
                            const next =
                              event.key === 'ArrowRight'
                                ? keys[(index + 1) % 3]
                                : event.key === 'ArrowLeft'
                                  ? keys[(index + 2) % 3]
                                  : event.key === 'Home'
                                    ? keys[0]
                                    : event.key === 'End'
                                      ? keys[2]
                                      : null;
                            if (next) {
                              event.preventDefault();
                              setTab(next);
                              document.getElementById(`editor-tab-${next}`)?.focus();
                            }
                          }}
                          onClick={() => setTab(key)}
                        >
                          {{ content: 'Isi soal', metadata: 'Metadata', media: 'Media' }[key]}
                        </button>
                      ))}
                    </div>
                    <section
                      role="tabpanel"
                      id={`editor-panel-${tab}`}
                      aria-labelledby={`editor-tab-${tab}`}
                      tabIndex={0}
                    >
                      {tab === 'metadata' && (
                        <dl className="question-editor-identifiers">
                          <div>
                            <dt>ID soal</dt>
                            <dd>{detail.questionId}</dd>
                          </div>
                          <div>
                            <dt>ID versi</dt>
                            <dd>{detail.id}</dd>
                          </div>
                          <div>
                            <dt>Sumber</dt>
                            <dd>{detail.sourceNamespace ?? 'Belum tercatat'}</dd>
                          </div>
                        </dl>
                      )}
                      {tab !== 'media' ? (
                        <ManualQuestionFields
                          section={tab}
                          json={json}
                          change={change}
                          disabled={!editable || busy}
                        />
                      ) : (
                        <>
                          <h3>Media soal</h3>
                          <p>
                            Gambar tetap tampil bersama isi soal di pratinjau. Pilih aset untuk
                            mengganti gambar atau mengubah teks alternatifnya.
                          </p>
                          {!assets.length && <p>Soal ini belum memiliki media.</p>}
                          {assets.map((asset, index) => (
                            <section className="question-editor-asset" key={String(asset.assetId)}>
                              <h4>{String(asset.assetId)}</h4>
                              <p>
                                Digunakan pada:{' '}
                                {(
                                  {
                                    STEM: 'Soal',
                                    OPTION: 'Pilihan jawaban',
                                    STATEMENT: 'Pernyataan',
                                    EXPLANATION: 'Pembahasan',
                                  } as Record<string, string>
                                )[String(asset.placement)] ?? String(asset.placement)}
                              </p>
                              <label>
                                Teks alternatif
                                <input
                                  value={String(asset.altText ?? '')}
                                  disabled={!editable || busy}
                                  onChange={(event) =>
                                    change(
                                      JSON.stringify(
                                        {
                                          ...payload,
                                          metadata: {
                                            ...metadata,
                                            assetManifest: assets.map((entry, i) =>
                                              i === index
                                                ? { ...entry, altText: event.target.value }
                                                : entry,
                                            ),
                                          },
                                        },
                                        null,
                                        2,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              {editable && !busy && (
                                <MediaUpload
                                  token={token}
                                  initialExternalId={String(payload.externalId ?? '')}
                                  initialAssetId={String(asset.assetId)}
                                  onVerified={(receipt) => {
                                    if (
                                      receipt.assetId !== asset.assetId ||
                                      receipt.externalId !== payload.externalId
                                    ) {
                                      setError(
                                        'Identitas unggahan harus sama dengan soal dan aset yang diganti.',
                                      );
                                      return;
                                    }
                                    const replaceKeys = (value: unknown) => {
                                      if (!value || typeof value !== 'object') return value;
                                      const content = value as Record<string, unknown>;
                                      return {
                                        ...content,
                                        ...(Array.isArray(content.assetKeys)
                                          ? {
                                              assetKeys: content.assetKeys.map((key) =>
                                                key === asset.objectKey ? receipt.objectKey : key,
                                              ),
                                            }
                                          : {}),
                                      };
                                    };
                                    change(
                                      JSON.stringify(
                                        {
                                          ...payload,
                                          stem: replaceKeys(payload.stem),
                                          explanation: replaceKeys(payload.explanation),
                                          options: Array.isArray(payload.options)
                                            ? payload.options.map(
                                                (option: Record<string, unknown>) => ({
                                                  ...option,
                                                  content: replaceKeys(option.content),
                                                }),
                                              )
                                            : payload.options,
                                          metadata: {
                                            ...metadata,
                                            assetManifest: assets.map((entry, i) =>
                                              i === index ? { ...entry, ...receipt } : entry,
                                            ),
                                          },
                                        },
                                        null,
                                        2,
                                      ),
                                    );
                                    setNotice(
                                      'Gambar terunggah. Simpan perubahan untuk menerapkannya.',
                                    );
                                  }}
                                />
                              )}
                            </section>
                          ))}
                          {editable && !busy && (
                            <section className="question-editor-asset">
                              <h4>Tambah gambar</h4>
                              <label>
                                Letak gambar
                                <select
                                  value={newMediaPlacement}
                                  onChange={(event) => setNewMediaPlacement(event.target.value)}
                                >
                                  <option value="STEM">Soal</option>
                                  <option value="EXPLANATION">Pembahasan</option>
                                </select>
                              </label>
                              <label>
                                Teks alternatif gambar
                                <input
                                  maxLength={1000}
                                  value={newMediaAlt}
                                  onChange={(event) => setNewMediaAlt(event.target.value)}
                                />
                              </label>
                              <MediaUpload
                                token={token}
                                initialExternalId={String(payload.externalId ?? '')}
                                onVerified={(receipt) => {
                                  if (
                                    receipt.externalId !== payload.externalId ||
                                    assets.some((asset) => asset.assetId === receipt.assetId)
                                  ) {
                                    setError(
                                      'Gunakan identitas soal yang sama dan ID gambar yang belum dipakai.',
                                    );
                                    return;
                                  }
                                  const marker = `[[asset:${receipt.assetId}]]`;
                                  const field =
                                    newMediaPlacement === 'STEM' ? 'stem' : 'explanation';
                                  const content = payload[field] as {
                                    text: string;
                                    assetKeys?: string[];
                                  };
                                  change(
                                    JSON.stringify(
                                      {
                                        ...payload,
                                        [field]: {
                                          ...content,
                                          text: `${content.text}\n${marker}`,
                                          assetKeys: [
                                            ...(content.assetKeys ?? []),
                                            receipt.objectKey,
                                          ],
                                        },
                                        metadata: {
                                          ...metadata,
                                          assetManifest: [
                                            ...assets,
                                            {
                                              ...receipt,
                                              placement: newMediaPlacement,
                                              itemId: null,
                                              assetOrder: assets.length + 1,
                                              textMarker: marker,
                                              altText: newMediaAlt,
                                            },
                                          ],
                                        },
                                      },
                                      null,
                                      2,
                                    ),
                                  );
                                  setNotice(
                                    'Gambar ditambahkan. Simpan perubahan untuk menerapkannya.',
                                  );
                                }}
                              />
                            </section>
                          )}
                        </>
                      )}
                    </section>
                    {!!issues.length && (
                      <div role="alert">
                        <h3>Perlu dilengkapi</h3>
                        <ul>
                          {issues.map((issue, i) => (
                            <li key={i}>
                              {issue.detail} <small>({issue.code})</small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                  <Button
                    variant="secondary"
                    className="question-editor-preview-toggle"
                    onClick={() => setPreview(!preview)}
                  >
                    {preview ? 'Tutup pratinjau' : 'Lihat pratinjau'}
                  </Button>
                  <Card className={`question-editor-preview${preview ? ' is-open' : ''}`}>
                    <h3>Pratinjau soal</h3>
                    <p>Menampilkan perubahan yang sedang diedit.</p>
                    <ContentPayload
                      payload={payload}
                      media={media}
                      retryMedia={() => {
                        void getContentVersionMedia(token, id).then(
                          (links) => setMedia(links?.items ?? []),
                          () => setError('Gambar gagal dimuat ulang.'),
                        );
                      }}
                    />
                  </Card>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AdminFrame>
  );
}
