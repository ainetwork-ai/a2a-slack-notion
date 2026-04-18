export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="space-y-0.5 px-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5">
          <div className="shrink-0 w-5 h-5 rounded-full" style={{ background: 'var(--bg-hover)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div className="h-3 rounded flex-1" style={{ background: 'var(--bg-hover)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 100}ms`, maxWidth: `${55 + i * 15}%` }} />
        </div>
      ))}
    </div>
  );
}
