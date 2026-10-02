import { notFound } from 'next/navigation';
import QuestionBankPreview from './preview';

/**
 * Entry point for the admin preview route, only reachable in development builds.
 */
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <QuestionBankPreview />;
}
