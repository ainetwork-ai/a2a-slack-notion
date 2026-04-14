'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Hash, MessageSquare, User, Loader2 } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { useSearch } from '@/lib/hooks/use-search';

export default function SearchModal() {
  const router = useRouter();
  const { searchOpen, setSearchOpen } = useAppStore();
  const { results, isSearching, query, search, clearSearch } = useSearch();

  // Cmd+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen]);

  function handleClose() {
    setSearchOpen(false);
    clearSearch();
  }

  function handleSelect(result: { type: string; channelId?: string; id: string }) {
    if (result.type === 'channel') {
      router.push(`/workspace/channel/${result.id}`);
    } else if (result.type === 'message' && result.channelId) {
      router.push(`/workspace/channel/${result.channelId}`);
    }
    handleClose();
  }

  const channelResults = results.filter(r => r.type === 'channel');
  const messageResults = results.filter(r => r.type === 'message');
  const userResults = results.filter(r => r.type === 'user');

  return (
    <CommandDialog open={searchOpen} onOpenChange={(open) => !open && handleClose()}>
      <CommandInput
        placeholder="Search messages, channels, people..."
        value={query}
        onValueChange={search}
        className="text-white placeholder:text-slate-500"
      />
      <CommandList className="bg-[#222529] text-white">
        {isSearching && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        )}

        {!isSearching && query && results.length === 0 && (
          <CommandEmpty className="text-slate-400">
            No results found for &quot;{query}&quot;
          </CommandEmpty>
        )}

        {!query && (
          <CommandEmpty className="text-slate-400">
            Type to search messages, channels, and people
          </CommandEmpty>
        )}

        {channelResults.length > 0 && (
          <CommandGroup heading="Channels" className="text-slate-400">
            {channelResults.map(result => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result)}
                className="text-white hover:bg-white/10 cursor-pointer"
              >
                <Hash className="w-4 h-4 mr-2 text-slate-400" />
                <span>{result.content}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {channelResults.length > 0 && messageResults.length > 0 && (
          <CommandSeparator className="bg-white/10" />
        )}

        {messageResults.length > 0 && (
          <CommandGroup heading="Messages" className="text-slate-400">
            {messageResults.map(result => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result)}
                className="text-white hover:bg-white/10 cursor-pointer flex-col items-start"
              >
                <div className="flex items-center gap-2 w-full">
                  <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="font-medium text-sm truncate">{result.senderName}</span>
                  {result.channelName && (
                    <span className="text-slate-400 text-xs ml-auto shrink-0">#{result.channelName}</span>
                  )}
                </div>
                <p className="text-slate-400 text-xs mt-0.5 pl-6 line-clamp-1">{result.content}</p>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {userResults.length > 0 && (
          <>
            {(channelResults.length > 0 || messageResults.length > 0) && (
              <CommandSeparator className="bg-white/10" />
            )}
            <CommandGroup heading="People" className="text-slate-400">
              {userResults.map(result => (
                <CommandItem
                  key={result.id}
                  onSelect={() => handleSelect(result)}
                  className="text-white hover:bg-white/10 cursor-pointer"
                >
                  <User className="w-4 h-4 mr-2 text-slate-400" />
                  <span>{result.content}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
