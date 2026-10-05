import Link from 'next/link';
import { Badge, Card, EmptyState, Icon, type IconName } from '@tka/ui';
import type { ReactNode } from 'react';

export function TeacherMetric({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  detail?: string;
}) {
  return (
    <Card className="teacher-metric">
      <span className="icon-tile">
        <Icon name={icon} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </Card>
  );
}

export function TeacherAnnouncement({ children }: { children: ReactNode }) {
  return (
    <div className="teacher-announcement">
      <Icon name="info" />
      <p>{children}</p>
    </div>
  );
}

export function TeacherUnavailable({
  title,
  description,
  icon = 'lock',
}: {
  title: string;
  description: string;
  icon?: IconName;
}) {
  return (
    <Card className="teacher-unavailable">
      <Badge variant="default">Belum tersedia</Badge>
      <EmptyState icon={<Icon name={icon} />} title={title} description={description} />
      <Link className="button-link" href="/teacher">
        Kembali ke kelas saya
      </Link>
    </Card>
  );
}
