'use client';

export default function MessageSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-1.5 animate-pulse">
      {/* Avatar circle */}
      <div className="w-9 h-9 rounded-full bg-white/10 shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
        {/* Name + timestamp bar */}
        <div className="flex items-center gap-2">
          <div className="h-3 w-24 rounded bg-white/10" />
          <div className="h-2.5 w-10 rounded bg-white/5" />
        </div>
        {/* Content bars */}
        <div className="h-3 w-3/4 rounded bg-white/10" />
        <div className="h-3 w-1/2 rounded bg-white/10" />
      </div>
    </div>
  );
}
