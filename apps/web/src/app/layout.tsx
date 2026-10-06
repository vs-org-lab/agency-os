import type { ReactNode } from 'react';
import { Fraunces, Inter, Space_Mono } from 'next/font/google';
import { ThemeProvider } from '@agency-os/ui/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-PT"
      className={`${inter.variable} ${spaceMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
