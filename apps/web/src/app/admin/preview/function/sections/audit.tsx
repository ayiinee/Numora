import type { PreviewRecord } from '../types';

/**
 * Shows the dummy admin activity log and lets the user append a test entry.
 */
export function AuditSection({ entries, record }: { entries: string[]; record: PreviewRecord }) {
  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <h2>Aktivitas Admin</h2>
          <span>Catatan contoh dan aksi selama sesi preview</span>
        </div>
        <button className="quiet-button" onClick={() => record('menambahkan catatan uji')}>
          ＋ Catat uji
        </button>
      </div>
      <ol className="preview-audit-list">
        {entries.map((item, index) => (
          <li key={`${item}-${index}`}>
            <span className="audit-mark" aria-hidden="true">
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
