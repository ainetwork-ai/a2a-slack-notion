import './globals-notion.css';

export const metadata = { title: 'Notion (embedded)' };

// This layout wraps the `/notion-embed/*` routes rendered inside the canvas iframe.
// The iframe is same-origin, so `slack-a2a-session` cookies flow through to the
// existing Hocuspocus / page API auth checks unchanged.
export default function NotionEmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="notion-embed-root min-h-screen bg-white text-neutral-900">
      {children}
    </div>
  );
}
