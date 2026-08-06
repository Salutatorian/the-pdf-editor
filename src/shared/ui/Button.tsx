import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "default"
  | "ghost"
  | "outline"
  | "primary"
  | "danger";

export type ButtonSize = "sm" | "md";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  pressed?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const variantClass: Record<ButtonVariant, string> = {
  default: "",
  ghost: "btn--ghost",
  outline: "btn--outline",
  primary: "btn--primary",
  danger: "btn--danger",
};

export function Button({
  variant = "default",
  size = "md",
  iconOnly = false,
  pressed,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    variantClass[variant],
    size === "sm" ? "btn--sm" : "",
    iconOnly ? "btn--icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      aria-pressed={pressed === undefined ? undefined : pressed}
      {...rest}
    >
      {children}
    </button>
  );
}
