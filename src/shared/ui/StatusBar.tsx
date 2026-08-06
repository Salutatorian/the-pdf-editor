import type { HTMLAttributes, ReactNode } from "react";

export type StatusTone = "default" | "success" | "warning" | "error";

export type StatusBarProps = {
  message?: ReactNode;
  tone?: StatusTone;
  pageLabel?: string;
  zoomLabel?: string;
  meta?: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function StatusBar({
  message,
  tone = "default",
  pageLabel,
  zoomLabel,
  meta,
  className = "",
  ...rest
}: StatusBarProps) {
  const toneClass =
    tone === "default" ? "" : `status-bar__tone--${tone}`;

  return (
    <footer
      className={`status-bar ${className}`.trim()}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <div className={`status-bar__message ${toneClass}`.trim()}>
        {message ?? "Ready"}
      </div>
      <div className="status-bar__meta">
        {meta}
        {pageLabel ? <span>{pageLabel}</span> : null}
        {zoomLabel ? <span>{zoomLabel}</span> : null}
      </div>
    </footer>
  );
}
