import type { ReactNode } from 'react';
import { StudentAccess } from '@/features/core-learning/student-session';
import './student-features.css';
import './student-visibility.css';

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="student-area">
      <StudentAccess>{children}</StudentAccess>
    </div>
  );
}
