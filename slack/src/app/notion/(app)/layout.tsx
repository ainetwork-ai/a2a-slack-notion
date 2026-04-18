import { GlobalSearch } from '@/components/notion/global-search';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <GlobalSearch />
    </>
  );
}
