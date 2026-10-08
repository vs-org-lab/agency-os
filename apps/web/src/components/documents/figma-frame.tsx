export function FigmaFrame({
  embedUrl,
  title,
  className,
}: {
  embedUrl: string;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={
        className ??
        'aspect-video w-full overflow-hidden rounded-lg border border-border bg-surface-muted'
      }
    >
      <iframe
        src={embedUrl}
        title={title}
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className="size-full"
      />
    </div>
  );
}
