import type { Metadata } from 'next';
import { Web3Provider } from '@/providers/web3-provider';
import './notion.css';

export const metadata: Metadata = {
  title: 'Notion Clone',
  description: 'Team document collaboration and project management tool',
};

export default function NotionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Web3Provider>{children}</Web3Provider>;
}
