import PageFullClient from './PageFullClient';

export default async function FullPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PageFullClient pageId={id} />;
}
