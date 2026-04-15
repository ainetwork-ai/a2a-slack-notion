import { GlobalSearch } from '@/components/global-search';

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
