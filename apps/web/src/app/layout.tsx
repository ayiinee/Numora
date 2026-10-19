import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './numora.css';
import './teacher.css';
import './admin-content.css';
import './admin-operations.css';
import { AuthProvider } from '@/features/onboarding/auth';
import 'katex/dist/katex.min.css';

const jakarta = localFont({
  src: './fonts/PlusJakartaSansVariable.ttf',
  display: 'swap',
  weight: '200 800',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: 'NUMORA',
  description: 'Belajar matematika TKA dengan langkah yang jelas.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
