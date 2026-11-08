import Link from 'next/link';
import { Icon } from '@tka/ui';
import {
  analyticsDomains,
  coveragePercent,
  metricDescriptions,
  metricDomain,
  metricLabels,
  metricNumber,
  metricText,
  type AnalyticsMetric,
} from './analytics-model';

function MetricValue({ metric }: { metric: AnalyticsMetric | undefined }) {
  return (
    <span
      className={
        metricNumber(metric) === null ? 'analytics-value is-unavailable' : 'analytics-value'
      }
    >
      {metricText(metric)}
    </span>
  );
}
function ComparisonRows({
  rows,
  maximum,
}: {
  rows: { label: string; metric: AnalyticsMetric | undefined; tone?: string }[];
  maximum?: number;
}) {
  const scale = maximum ?? Math.max(0, ...rows.map((row) => metricNumber(row.metric) ?? 0));
  return (
    <dl className="analytics-comparisons">
      {rows.map(({ label, metric, tone }) => (
        <div className="analytics-comparison" key={label} data-metric={metric?.key}>
          <dt>{label}</dt>
          <dd>
            <MetricValue metric={metric} />
            <div className={`analytics-bar ${tone ?? ''}`} aria-hidden="true">
              <span
                style={{
                  width:
                    metricNumber(metric) !== null && scale > 0
                      ? `${(metricNumber(metric)! / scale) * 100}%`
                      : '0%',
                }}
              />
            </div>
          </dd>
        </div>
      ))}
    </dl>
  );
}
const primary = [
  { key: 'students', icon: 'users', label: 'Akun siswa aktif' },
  { key: 'classes', icon: 'school', label: 'Kelas aktif' },
  { key: 'readyVersions', icon: 'book', label: 'Versi soal READY' },
  { key: 'overdueReleases', icon: 'chart', label: 'Rilis melewati 72 jam' },
] as const;
const attention = [
  {
    key: 'openReports',
    label: 'Laporan terbuka',
    description: 'Laporan soal dan video berstatus terbuka atau dalam review.',
    href: '/admin/content?view=reports',
    action: 'Tinjau laporan',
  },
  {
    key: 'closedUnpublishedBatches',
    label: 'Batch tutup belum rilis',
    description: 'Hasil belum dipublikasikan; periksa kesiapan dan blocker rilis.',
    href: '/admin/irt',
    action: 'Periksa batch',
  },
  {
    key: 'failedIrtRequests',
    label: 'Request IRT gagal',
    description: 'Request berstatus gagal. Tinjau detail sebelum menentukan tindak lanjut.',
    href: '/admin/irt',
    action: 'Tinjau request',
  },
];
export function AnalyticsDashboard({ metrics }: { metrics: AnalyticsMetric[] }) {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const consumed = new Set<string>();
  const kpis = primary.filter((item) => byKey.has(item.key));
  kpis.forEach((item) => consumed.add(item.key));
  const activities = [
    { name: 'Drill', start: 'drillStarted', end: 'drillCompleted' },
    { name: 'Tryout', start: 'tryoutStarted', end: 'tryoutCompleted' },
  ].filter((item) => byKey.has(item.start) || byKey.has(item.end));
  activities.forEach((item) => {
    consumed.add(item.start);
    consumed.add(item.end);
  });
  const activityMax = Math.max(
    0,
    ...activities.flatMap((item) => [
      metricNumber(byKey.get(item.start)) ?? 0,
      metricNumber(byKey.get(item.end)) ?? 0,
    ]),
  );
  const followups = attention.filter((item) => byKey.has(item.key));
  followups.forEach((item) => consumed.add(item.key));
  const hasStudents = byKey.has('mandiriStudents') || byKey.has('schoolStudents');
  if (hasStudents) {
    consumed.add('mandiriStudents');
    consumed.add('schoolStudents');
  }
  const hasCoverage = byKey.has('levelsWithPublishedDrill') || byKey.has('totalLevels');
  if (hasCoverage) {
    consumed.add('levelsWithPublishedDrill');
    consumed.add('totalLevels');
  }
  const covered = byKey.get('levelsWithPublishedDrill'),
    total = byKey.get('totalLevels');
  const percent = coveragePercent(covered, total);
  const coveredValue = metricNumber(covered);
  const totalValue = metricNumber(total);
  const other = metrics.filter((metric) => !consumed.has(metric.key));
  const domains = [...new Set(other.map(metricDomain))];
  return (
    <>
      {kpis.length > 0 && (
        <dl className="analytics-kpis">
          {kpis.map((item) => {
            const metric = byKey.get(item.key)!;
            return (
              <div
                className={`analytics-kpi${item.key === 'overdueReleases' && metricNumber(metric)! > 0 ? ' is-attention' : ''}`}
                key={item.key}
                data-metric={item.key}
              >
                <dt>
                  <Icon name={item.icon} />
                  {item.label}
                </dt>
                <dd>
                  <MetricValue metric={metric} />
                  <p>{metricDescriptions[item.key]}</p>
                  {item.key === 'overdueReleases' && <Link href="/admin/irt">Periksa rilis</Link>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {(activities.length > 0 || followups.length > 0) && (
        <div className="analytics-main-grid">
          {activities.length > 0 && (
            <section
              className="analytics-panel analytics-activity"
              aria-labelledby="analytics-activity-title"
            >
              <header>
                <div>
                  <h2 id="analytics-activity-title">Pengerjaan belajar</h2>
                  <p>Jumlah pengerjaan kumulatif, bukan jumlah siswa unik.</p>
                </div>
                <span className="analytics-context">Kumulatif</span>
              </header>
              <div className="analytics-activity-groups">
                {activities.map((item) => (
                  <section key={item.name} aria-label={`Pengerjaan ${item.name}`}>
                    <h3>{item.name}</h3>
                    <ComparisonRows
                      maximum={activityMax}
                      rows={[
                        { label: 'Dimulai', metric: byKey.get(item.start), tone: 'is-started' },
                        { label: 'Selesai', metric: byKey.get(item.end), tone: 'is-completed' },
                      ]}
                    />
                  </section>
                ))}
              </div>
              <p className="analytics-note">
                Semua batang memakai skala yang sama, dimulai dari nol. Selesai termasuk dalam
                dimulai; keduanya tidak dijumlahkan. Selesai berarti pengerjaan berstatus GRADED,
                bukan tingkat penguasaan materi.
              </p>
            </section>
          )}
          {followups.length > 0 && (
            <section
              className="analytics-panel analytics-attention"
              aria-labelledby="analytics-attention-title"
            >
              <header>
                <div>
                  <h2 id="analytics-attention-title">Perlu ditinjau</h2>
                  <p>Periksa konteks sebelum mengambil tindakan.</p>
                </div>
              </header>
              <ul>
                {followups.map((item) => (
                  <li key={item.key} data-metric={item.key}>
                    <div>
                      <h3>{item.label}</h3>
                      <MetricValue metric={byKey.get(item.key)} />
                    </div>
                    <p>{item.description}</p>
                    <Link href={item.href}>{item.action}</Link>
                  </li>
                ))}
              </ul>
              <p className="analytics-note">
                Kategori dapat saling terkait. Angka di sini tidak dijumlahkan menjadi total
                masalah.
              </p>
            </section>
          )}
        </div>
      )}
      {(hasStudents || hasCoverage) && (
        <div className="analytics-secondary-grid">
          {hasStudents && (
            <section className="analytics-panel" aria-labelledby="analytics-students-title">
              <header>
                <div>
                  <h2 id="analytics-students-title">Keanggotaan siswa</h2>
                  <p>Akun aktif menurut keanggotaan kelas yang tercatat.</p>
                </div>
              </header>
              <ComparisonRows
                rows={[
                  { label: 'Mandiri', metric: byKey.get('mandiriStudents'), tone: 'is-started' },
                  {
                    label: 'Dengan keanggotaan aktif',
                    metric: byKey.get('schoolStudents'),
                    tone: 'is-completed',
                  },
                ]}
              />
              <p className="analytics-note">
                Mandiri berarti tidak memiliki keanggotaan aktif. Satu akun tetap dihitung satu kali
                pada kelompoknya.
              </p>
            </section>
          )}
          {hasCoverage && (
            <section className="analytics-panel" aria-labelledby="analytics-coverage-title">
              <header>
                <div>
                  <h2 id="analytics-coverage-title">Cakupan paket Drill</h2>
                  <p>Level dengan paket Drill aktif dibanding seluruh level tercatat.</p>
                </div>
              </header>
              <div className="analytics-coverage-value">
                <strong data-metric={covered?.key}>{metricText(covered)}</strong>
                <span data-metric={total?.key}>dari {metricText(total)} level</span>
                {percent !== null && (
                  <b>{percent.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</b>
                )}
              </div>
              {percent !== null ? (
                <div className="analytics-coverage-bar" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </div>
              ) : (
                <p className="analytics-note" role="status">
                  {totalValue === 0 && coveredValue === 0
                    ? 'Belum ada level untuk menghitung cakupan.'
                    : coveredValue !== null && totalValue !== null && coveredValue > totalValue
                      ? 'Angka cakupan belum konsisten. Perbarui data atau periksa sumber.'
                      : 'Cakupan belum dapat dihitung karena data belum tersedia.'}
                </p>
              )}
              <p className="analytics-note">
                Hanya paket Drill terbit non-demo. Cakupan menunjukkan ketersediaan paket, bukan
                kualitas atau kelulusan siswa.
              </p>
              <Link className="analytics-panel-link" href="/admin/content?view=drill">
                Kelola paket Drill
              </Link>
            </section>
          )}
        </div>
      )}
      {other.length > 0 && (
        <section className="analytics-details" aria-labelledby="analytics-details-title">
          <h2 id="analytics-details-title">Rincian operasional</h2>
          <div className="analytics-detail-grid">
            {domains.map((domain) => (
              <section className="analytics-panel" key={domain}>
                <h3>{analyticsDomains[domain] ?? 'Data tambahan'}</h3>
                <dl>
                  {other
                    .filter((metric) => metricDomain(metric) === domain)
                    .map((metric) => (
                      <div key={metric.key} data-metric={metric.key}>
                        <dt>
                          {metricLabels[metric.key] ?? metric.label}
                          {metricDescriptions[metric.key] && (
                            <small>{metricDescriptions[metric.key]}</small>
                          )}
                        </dt>
                        <dd>
                          <MetricValue metric={metric} />
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            ))}
          </div>
        </section>
      )}
      <details className="analytics-definitions">
        <summary>Cara membaca dashboard</summary>
        <ul>
          <li>
            Angka mengikuti data tersimpan saat pembaruan. Dashboard ini tidak menyediakan filter
            periode atau riwayat tren.
          </li>
          <li>
            Akun aktif adalah status akun, bukan aktivitas hari ini. Keanggotaan kelas menghitung
            relasi; satu siswa dapat memiliki beberapa keanggotaan.
          </li>
          <li>
            Versi soal READY berbeda dari soal unik dan paket terbit. Rilis hasil Tryout berbeda
            dari penyelesaian pengerjaan.
          </li>
          <li>
            Nilai nol adalah data yang sah. Tidak tersedia berarti sumber belum dapat dibaca; angka
            tersebut tidak diganti dengan nol.
          </li>
        </ul>
      </details>
    </>
  );
}
