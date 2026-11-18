import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'DevSync AI', template: '%s · DevSync AI' },
  description: 'Coordinate developers and their AI coding agents.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
