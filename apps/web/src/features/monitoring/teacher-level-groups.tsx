import { Card, EmptyState, Icon } from '@tka/ui';
import type { MonitoredLevelDto } from '@/lib/generated-api-types';
import { MonitoredLevelCard } from './teacher-presentation';

export function TeacherLevelGroups({ levels }: { levels: MonitoredLevelDto[] }) {
  const chapters = new Map<string, Map<string, MonitoredLevelDto[]>>();
  for (const level of levels) {
    if (!chapters.has(level.chapterLabel)) chapters.set(level.chapterLabel, new Map());
    const subchapters = chapters.get(level.chapterLabel)!;
    if (!subchapters.has(level.subchapterLabel)) subchapters.set(level.subchapterLabel, []);
    subchapters.get(level.subchapterLabel)!.push(level);
  }
  if (!levels.length)
    return (
      <Card>
        <EmptyState
          icon={<Icon name="book" />}
          title="Belum ada level"
          description="Progres tampil setelah materi tersedia."
        />
      </Card>
    );
  return (
    <section className="teacher-page-stack" aria-label="Progres per level">
      <p className="teacher-help-text">
        Nilai terakhir dan terbaik dicatat terpisah. — berarti belum ada hasil.
      </p>
      {Array.from(chapters, ([chapter, subchapters], index) => (
        <details className="teacher-chapter" key={chapter} open={index === 0}>
          <summary>
            <Icon name="book" />
            <h2>{chapter}</h2>
            <Icon name="chevron" />
          </summary>
          <div className="teacher-chapter__body">
            {Array.from(subchapters, ([subchapter, items]) => (
              <section className="teacher-subchapter" key={subchapter} aria-label={subchapter}>
                <h3>{subchapter}</h3>
                <div className="teacher-level-head" aria-hidden="true">
                  <span>Level</span>
                  <span>Status</span>
                  <span>Nilai terakhir</span>
                  <span>Nilai terbaik</span>
                </div>
                <div className="teacher-level-grid">
                  {items.map((level) => (
                    <MonitoredLevelCard key={level.levelId} value={level} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
