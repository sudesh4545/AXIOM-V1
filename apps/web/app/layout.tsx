import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://axiom-v1-sudesh.rankpushidff4.chatgpt.site'),
  title: 'AXIOM — Verified Experimentation OS',
  description: 'Turn business objectives into safe, measurable and verified experiments.',
  openGraph: {
    title: 'AXIOM — Verified Experimentation OS',
    description: 'From business objectives to verified experiments.',
    images: [{ url: '/og.png', width: 1680, height: 945, alt: 'AXIOM verified experimentation network' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AXIOM — Verified Experimentation OS',
    description: 'From business objectives to verified experiments.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
