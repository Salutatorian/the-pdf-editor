import type { HTMLAttributes, ReactNode } from "react";

export type TooltipProps = {
  content: ReactNode;
  shortcut?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLSpanElement>;

export function Tooltip({
  content,
  shortcut,
  children,
  className = "",
  ...rest
}: TooltipProps) {
  return (
    <span className={`tooltip-wrap ${className}`.trim()} {...rest}>
      {children}
      <span role="tooltip" className="tooltip">
        {content}
        {shortcut ? <span className="tooltip__kbd">{shortcut}</span> : null}
      </span>
    </span>
  );
}
