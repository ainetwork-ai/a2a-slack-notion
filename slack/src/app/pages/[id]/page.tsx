import NotionPage from '@/components/notion/NotionPage';

export default async function FullPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex h-screen w-screen bg-[#1a1d21]">
      <NotionPage pageId={id} mode="full" />
    </div>
  );
}
