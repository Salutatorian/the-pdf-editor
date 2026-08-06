import type { HTMLAttributes, ReactNode } from "react";

export type PanelProps = {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
} & HTMLAttributes<HTMLElement>;

export function Panel({
  title,
  actions,
  children,
  empty = false,
  emptyMessage = "Nothing selected",
  className = "",
  ...rest
}: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()} {...rest}>
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {actions ? <div className="panel__actions">{actions}</div> : null}
      </header>
      <div className="panel__body">
        {empty ? (
          <p className="panel__empty">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
