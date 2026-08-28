import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './start-from-scratch.css';
import './demo-walkthrough.css';
import './opencad-workspace.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(deploymentHost ? `https://${deploymentHost}` : 'http://localhost:3000'),
  title: 'Forma Labs — Rover Engineering Workspace',
  description: 'Review rover parts, dependencies, engineering changes, revisions, and validation results.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Forma Labs — Rover Engineering Workspace',
    description: 'Review how rover changes affect mechanical, electrical, firmware, BOM, manufacturing, supplier, and test artifacts.',
    images: [{ url: '/og.png', width: 1536, height: 864, alt: 'Forma Labs rover engineering graph' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Forma Labs — Rover Engineering Workspace',
    description: 'Review rover dependencies, proposed changes, validation results, and revisions.',
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
