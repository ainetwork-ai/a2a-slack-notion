import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Unblock Agents',
  description: 'A2A server hosting the 10 Unblock Media agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
