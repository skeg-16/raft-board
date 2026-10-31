import type { Metadata, Viewport } from 'next';
import { Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { getCurrentProfile } from '@/lib/auth';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Raft Board — Otter Software Systems',
    template: '%s | Raft Board',
  },
  description: 'Weekly progress game for Otter Software Systems. Building software like no otter.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Raft Board',
  },
};

export const viewport: Viewport = {
  themeColor: '#0284c7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <html lang="en" className={`${outfit.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 selection:bg-sky-200">
        <ServiceWorkerRegister />
        <AppHeader currentProfile={profile} />
        
        {/* Main Content Area: Centered container on desktop, full mobile layout */}
        <main className="flex-1 w-full max-w-md mx-auto pb-safe">
          {children}
        </main>

        <InstallPrompt />
        <BottomNav />
      </body>
    </html>
  );
}
