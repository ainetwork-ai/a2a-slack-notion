import NotionPage from '@/components/notion/NotionPage';

interface Props {
  params: Promise<{ id: string }>;
}

// Rendered inside the canvas iframe. The outer slack panel owns chrome
// (title, pipeline stepper, delete), so this page only renders the editor body.
export default async function NotionEmbedPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="h-screen w-screen">
      <NotionPage pageId={id} mode="full" />
    </div>
  );
}
