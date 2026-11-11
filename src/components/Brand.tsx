/** Product mark: three bars of a quote comparison, the shortest one marked as the winner. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#f0a202" />
      <rect x="6" y="7" width="16" height="3" rx="1.5" fill="#13203b" opacity=".45" />
      <rect x="6" y="12.5" width="12" height="3" rx="1.5" fill="#13203b" opacity=".45" />
      <rect x="6" y="18" width="8" height="3" rx="1.5" fill="#13203b" />
    </svg>
  );
}
