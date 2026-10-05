import { Suspense } from 'react';
import { TeacherMonitoringScreen } from '@/features/monitoring/teacher-monitoring';

export default function Page() {
  return (
    <Suspense>
      <TeacherMonitoringScreen />
    </Suspense>
  );
}
