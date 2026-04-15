import type { Metadata } from 'next';
import { Web3Provider } from '@/providers/web3-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Notion Clone',
  description: 'Team document collaboration and project management tool',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
