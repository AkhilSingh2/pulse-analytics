import type { Metadata } from 'next';
import { Fraunces, JetBrains_Mono, Outfit } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const sans = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' });
const serif = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Pulse', template: '%s · Pulse' },
  description: 'Product analytics for Northstar: live events, funnels, retention cohorts, and acquisition.',
};

const themeBoot = `(() => { try { var t = localStorage.getItem('pulse-theme'); var dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.classList.toggle('dark', dark); document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; } catch (e) {} })();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
