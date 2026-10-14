import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });

export const metadata: Metadata = { title: 'Brand Hub', robots: { index: false, follow: false } };

export default function BrandHubLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
