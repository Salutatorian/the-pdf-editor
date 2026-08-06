import type { HTMLAttributes, ReactNode } from "react";

export type ToolbarProps = {
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function Toolbar({ children, className = "", ...rest }: ToolbarProps) {
  return (
    <header className={`toolbar ${className}`.trim()} role="toolbar" {...rest}>
      {children}
    </header>
  );
}

export type ToolbarGroupProps = {
  children?: ReactNode;
  label?: string;
} & HTMLAttributes<HTMLDivElement>;

export function ToolbarGroup({
  children,
  label,
  className = "",
  ...rest
}: ToolbarGroupProps) {
  return (
    <div
      className={`toolbar__group ${className}`.trim()}
      role="group"
      aria-label={label}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ToolbarSpacer() {
  return <div className="toolbar__spacer" aria-hidden="true" />;
}

export function ToolbarBrand({ children }: { children?: ReactNode }) {
  return <div className="toolbar__brand">{children}</div>;
}
