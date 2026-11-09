import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LandingPage } from '@/features/landing/landing-page';

export const metadata: Metadata = {
  title: 'Pratinjau Landing Page | NUMORA',
  robots: { index: false, follow: false },
};

export default function LandingPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <LandingPage />;
}
