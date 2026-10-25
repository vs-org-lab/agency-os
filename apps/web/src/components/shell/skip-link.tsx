export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-body-sm focus:font-medium focus:text-text focus:ring-[3px] focus:ring-ring/50 focus:outline-none"
    >
      {label}
    </a>
  );
}
