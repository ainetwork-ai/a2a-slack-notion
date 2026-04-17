'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { PageShareModal } from './PageShareModal';

interface ShareButtonProps {
  pageId: string;
  className?: string;
}

export function ShareButton({ pageId, className }: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className={className}
      >
        <Share2 className="w-4 h-4 mr-1.5" />
        Share
      </Button>
      <PageShareModal
        pageId={pageId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
