import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Auth0Provider } from '@auth0/nextjs-auth0/client';
import { auth0 } from '@/lib/auth0';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WealthVision - 個人資産管理',
  description: '株式・FX・仮想通貨のポートフォリオ管理プラットフォーム',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth0.getSession();

  return (
    <html lang="ja" className="h-full">
      <body className={`${inter.className} min-h-full flex flex-col antialiased`}>
        <Auth0Provider user={session?.user}>{children}</Auth0Provider>
      </body>
    </html>
  );
}
