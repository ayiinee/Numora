'use client';

import { Avatar, Badge, Button, Card, Icon } from '@tka/ui';
import type { FeedbackDto } from '@/lib/generated-api-types';

export function FeedbackCard({
  item,
  pending = false,
  disabled = false,
  error,
  onRead,
}: {
  item: FeedbackDto;
  pending?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  onRead: () => void;
}) {
  return (
    <Card className="student-feedback-card" aria-labelledby={`feedback-${item.id}`}>
      <div className="student-feedback-card__header">
        <Avatar name={item.teacherName} />
        <div>
          <h2 id={`feedback-${item.id}`}>{item.teacherName}</h2>
          <p>Feedback dari Guru</p>
        </div>
        <div className="student-feedback-card__meta">
          {item.readAt && (
            <Badge variant="success">
              <Icon name="check" width={12} height={12} /> Sudah Dibaca
            </Badge>
          )}
          <time dateTime={item.sentAt}>
            {new Intl.DateTimeFormat('id-ID', {
              timeZone: 'Asia/Jakarta',
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(item.sentAt))}{' '}
            WIB
          </time>
        </div>
      </div>
      <blockquote className="student-feedback-card__body">
        <span aria-hidden="true" className="student-feedback-card__quote">
          ❞
        </span>
        <p>{item.body}</p>
      </blockquote>
      {!item.readAt && (
        <Button
          className="student-feedback-card__read"
          variant="secondary"
          disabled={disabled}
          onClick={onRead}
        >
          <Icon name="check" width={18} height={18} />
          {pending ? 'Menandai…' : error ? 'Coba tandai dibaca lagi' : 'Tandai Dibaca'}
        </Button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
