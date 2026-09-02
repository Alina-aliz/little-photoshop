import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000',
  ),
  title: 'DUET — Create with AI, not around it.',
  description: 'A collaborative canvas to create with AI, not around it, through WebMCP.',
  openGraph: {
    title: 'DUET — Create with AI, not around it.',
    description: 'Create with AI, not around it.',
    type: 'website',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'DUET AI creative editor' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DUET — Create with AI, not around it.',
    description: 'Create with AI, not around it.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
