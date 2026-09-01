import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000',
  ),
  title: 'Baby Photoshop — human + AI photo editor',
  description: 'A layer-based photo editor where humans and browser agents work on the same canvas through WebMCP.',
  openGraph: {
    title: 'Baby Photoshop — human + AI photo editor',
    description: 'Human hands. Agent speed. One canvas.',
    type: 'website',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'Baby Photoshop collaborative editor' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Baby Photoshop — human + AI photo editor',
    description: 'Human hands. Agent speed. One canvas.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
