import { Suspense } from 'react';
import { TeacherFeedbackScreen } from '@/features/monitoring/teacher-feedback';

export default function Page() {
  return (
    <Suspense>
      <TeacherFeedbackScreen />
    </Suspense>
  );
}
