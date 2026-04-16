'use client';

import { useState } from 'react';
import { Folder, FileText, Image, Star, Clock, BookOpen } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import useSWR from 'swr';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = 'all' | 'canvases' | 'recent' | 'starred';

interface FileEntry {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
  sender: {
    displayName: string;
    avatarUrl?: string | null;
    isAgent: boolean;
  };
}

interface Canvas {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author: {
    displayName: string;
    avatarUrl?: string | null;
  };
}

interface BookmarkEntry {
  id: string;
  createdAt: string;
  message: {
    id: string;
    content: string;
    createdAt: string;
  };
  sender: {
    displayName: string;
    avatarUrl?: string | null;
    isAgent: boolean;
  };
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image className="w-8 h-8 text-blue-400" />;
  return <FileText className="w-8 h-8 text-slate-400" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('all');

  const { data: filesData, isLoading: filesLoading } = useSWR<{ files: FileEntry[] }>(
    activeTab === 'all' || activeTab === 'recent' ? '/api/files' : null,
    fetcher
  );
  const { data: canvasesData, isLoading: canvasesLoading } = useSWR<{ canvases: Canvas[] }>(
    activeTab === 'canvases' ? '/api/canvases' : null,
    fetcher
  );
  const { data: bookmarksData, isLoading: bookmarksLoading } = useSWR<{ bookmarks: BookmarkEntry[] }>(
    activeTab === 'starred' ? '/api/bookmarks' : null,
    fetcher
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All files', icon: <Folder className="w-3.5 h-3.5" /> },
    { id: 'canvases', label: 'Canvases', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'recent', label: 'Recently viewed', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'starred', label: 'Starred', icon: <Star className="w-3.5 h-3.5" /> },
  ];

  const isLoading = filesLoading || canvasesLoading || bookmarksLoading;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/5 shrink-0 bg-[#1a1d21]">
        <Folder className="w-5 h-5 text-slate-400" />
        <span className="font-semibold text-white">Files</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 shrink-0 bg-[#1a1d21]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            Loading...
          </div>
        )}

        {/* All files / Recent */}
        {(activeTab === 'all' || activeTab === 'recent') && !filesLoading && (
          <>
            {(!filesData?.files || filesData.files.length === 0) && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 px-8 text-center">
                <Folder className="w-12 h-12 mb-2 opacity-30" />
                <p className="text-base font-semibold text-white">No files yet</p>
                <p className="text-sm text-slate-400">Files shared in channels will appear here.</p>
              </div>
            )}
            {filesData?.files?.map((file) => {
              const initials = file.sender.displayName
                .split(' ')
                .map((w: string) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              return (
                <a
                  key={file.id}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] border-b border-white/5 transition-colors"
                >
                  <FileIcon mimeType={file.mimeType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Avatar className="w-4 h-4">
                        {file.sender.avatarUrl && (
                          <AvatarImage src={file.sender.avatarUrl} alt={file.sender.displayName} />
                        )}
                        <AvatarFallback className="bg-[#4a154b] text-white text-[8px]">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-slate-500">{file.sender.displayName}</span>
                      <span className="text-xs text-slate-600">
                        {format(new Date(file.createdAt), 'MMM d')}
                      </span>
                      <span className="text-xs text-slate-600">{formatBytes(file.size)}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </>
        )}

        {/* Canvases */}
        {activeTab === 'canvases' && !canvasesLoading && (
          <>
            {(!canvasesData?.canvases || canvasesData.canvases.length === 0) && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 px-8 text-center">
                <BookOpen className="w-12 h-12 mb-2 opacity-30" />
                <p className="text-base font-semibold text-white">No canvases yet</p>
                <p className="text-sm text-slate-400">Canvases created in channels will appear here.</p>
              </div>
            )}
            {canvasesData?.canvases?.map((canvas) => {
              const initials = canvas.author.displayName
                .split(' ')
                .map((w: string) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              return (
                <div
                  key={canvas.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] border-b border-white/5 transition-colors"
                >
                  <BookOpen className="w-8 h-8 text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{canvas.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Avatar className="w-4 h-4">
                        {canvas.author.avatarUrl && (
                          <AvatarImage src={canvas.author.avatarUrl} alt={canvas.author.displayName} />
                        )}
                        <AvatarFallback className="bg-[#4a154b] text-white text-[8px]">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-slate-500">{canvas.author.displayName}</span>
                      <span className="text-xs text-slate-600">
                        Updated {format(new Date(canvas.updatedAt), 'MMM d')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Starred */}
        {activeTab === 'starred' && !bookmarksLoading && (
          <>
            {(!bookmarksData?.bookmarks || bookmarksData.bookmarks.length === 0) && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 px-8 text-center">
                <Star className="w-12 h-12 mb-2 opacity-30" />
                <p className="text-base font-semibold text-white">No starred items</p>
                <p className="text-sm text-slate-400">Bookmark messages to star them.</p>
              </div>
            )}
            {bookmarksData?.bookmarks?.map((item) => {
              const initials = item.sender.displayName
                .split(' ')
                .map((w: string) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] border-b border-white/5 transition-colors"
                >
                  <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                    {item.sender.avatarUrl && (
                      <AvatarImage src={item.sender.avatarUrl} alt={item.sender.displayName} />
                    )}
                    <AvatarFallback
                      className={
                        item.sender.isAgent
                          ? 'bg-[#36c5f0]/20 text-[#36c5f0] text-xs font-semibold'
                          : 'bg-[#4a154b] text-white text-xs font-semibold'
                      }
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-white text-sm">
                        {item.sender.displayName}
                      </span>
                      <span className="text-xs text-slate-500">
                        {format(new Date(item.message.createdAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-slate-300 text-sm line-clamp-3 break-words">
                      {item.message.content}
                    </p>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
