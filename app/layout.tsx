import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Forma — Physical Product Graph',
  description: 'Explore the connected dependencies behind an autonomous inspection rover.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Forma — Physical Product Graph',
    description: 'See how physical-product changes propagate across mechanical, electrical, firmware, BOM, manufacturing, suppliers, and tests.',
    images: [{ url: '/og.png', width: 1536, height: 864, alt: 'Forma physical product dependency graph' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Forma — Physical Product Graph',
    description: 'See how physical-product changes propagate across engineering domains.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
