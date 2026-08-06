import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ReUI Frame-inspired nested panel: bordered outer shell + concentric inner surface.
 * Inspired by https://reui.io/blocks/application/card — not a KPI grid clone.
 */
export function Frame({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="frame"
      className={cn(
        'rounded-xl border border-border bg-card/40 p-1 shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function FramePanel({
  className,
  children,
  dotted,
  ...props
}: HTMLAttributes<HTMLDivElement> & { dotted?: boolean }) {
  return (
    <div
      data-slot="frame-panel"
      className={cn(
        'rounded-[calc(var(--radius)-2px)] border border-border/80 bg-card text-card-foreground',
        dotted && 'bg-dot-grid',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function FrameHeader({
  className,
  title,
  description,
  action,
}: {
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="truncate text-sm font-medium tracking-tight">{title}</div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}
