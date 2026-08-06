import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
  title?: string;
  size?: number;
};

function BaseIcon({
  title,
  size = 16,
  className = "",
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function OpenIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2.5 3.5h4l1.5 1.5h5.5v7.5h-11z" />
      <path d="M5 8h6M8 5v6" />
    </BaseIcon>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 2.5h8.5L13.5 5v8.5h-11v-11z" />
      <path d="M5 2.5v3.5h5V2.5M5 13.5v-4h6v4" />
    </BaseIcon>
  );
}

export function SaveAsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2.5 2.5h7.5L12.5 5v2" />
      <path d="M4.5 2.5v3h4.5V2.5M4.5 13.5v-3.5h4" />
      <path d="M10 10.5h4M12 8.5v4" />
    </BaseIcon>
  );
}

export function ZoomInIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14M5 7h4M7 5v4" />
    </BaseIcon>
  );
}

export function ZoomOutIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14M5 7h4" />
    </BaseIcon>
  );
}

export function FitWidthIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2 4v8M14 4v8M5 8h6M5 8l2-2M5 8l2 2M11 8l-2-2M11 8l-2 2" />
    </BaseIcon>
  );
}

export function FitPageIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="2" width="9" height="12" rx="0.5" />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
    </BaseIcon>
  );
}

export function RotateIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M13 8a5 5 0 1 1-1.4-3.5" />
      <path d="M13 3.5V7h-3.5" />
    </BaseIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </BaseIcon>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 6H3.5V4.5" />
      <path d="M3.5 6a5 5 0 1 1 1.2 5.5" />
    </BaseIcon>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M11 6h1.5V4.5" />
      <path d="M12.5 6a5 5 0 1 0-1.2 5.5" />
    </BaseIcon>
  );
}

export function TextIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 3.5h4.5L13 9l-4 4-5.5-5.5z" />
      <path d="M5.5 6l1 1" />
    </BaseIcon>
  );
}

export function SignIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2.5 12.5c1.5-3 3-4.5 4.5-4.5S9.5 10 11 12.5" />
      <path d="M11 4.5c.8-.8 2-.8 2.8 0s.8 2 0 2.8L8 13H5.5v-2.5z" />
    </BaseIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </BaseIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </BaseIcon>
  );
}

export function ChevronIcon(
  props: IconProps & { facing?: "left" | "right" | "up" | "down" },
) {
  const { facing = "down", ...rest } = props;
  const rotate =
    facing === "down"
      ? 0
      : facing === "up"
        ? 180
        : facing === "left"
          ? 90
          : -90;

  return (
    <BaseIcon {...rest} style={{ ...rest.style, transform: `rotate(${rotate}deg)` }}>
      <path d="M4 6l4 4 4-4" />
    </BaseIcon>
  );
}

export function PrintIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 5V2.5h7V5" />
      <rect x="2.5" y="5" width="11" height="6.5" rx="1" />
      <path d="M4.5 9.5h7V13.5h-7z" />
      <path d="M11.5 7.25h.01" />
    </BaseIcon>
  );
}

export function DuplicateIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="4" width="8" height="9" rx="0.5" />
      <path d="M3.5 11.5V3.5h8" />
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 4.5h10M6 4.5V3h4v1.5M5 4.5l.5 8.5h5l.5-8.5" />
    </BaseIcon>
  );
}

export function SmartFillIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 4.5h10M3 8h7M3 11.5h5" />
      <path d="M11.5 8.5l1 1 2-2.5" />
    </BaseIcon>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5.5 7.5V4.5a1 1 0 0 1 2 0V7" />
      <path d="M7.5 7V3.5a1 1 0 0 1 2 0V7" />
      <path d="M9.5 7V4.5a1 1 0 0 1 2 0v5.2a3.2 3.2 0 0 1-3.2 3.3H8A3.5 3.5 0 0 1 4.5 9.5V7.5a1 1 0 0 1 2 0V9" />
    </BaseIcon>
  );
}

export function SelectIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3.5 2.5 7 13.5l1.5-4 4-1.5z" />
    </BaseIcon>
  );
}

export type IconName =
  | "open"
  | "save"
  | "saveAs"
  | "zoomIn"
  | "zoomOut"
  | "fitWidth"
  | "fitPage"
  | "rotate"
  | "search"
  | "undo"
  | "redo"
  | "text"
  | "sign"
  | "check"
  | "close"
  | "chevron"
  | "print"
  | "duplicate"
  | "trash"
  | "smartFill"
  | "hand"
  | "select";

const iconMap = {
  open: OpenIcon,
  save: SaveIcon,
  saveAs: SaveAsIcon,
  zoomIn: ZoomInIcon,
  zoomOut: ZoomOutIcon,
  fitWidth: FitWidthIcon,
  fitPage: FitPageIcon,
  rotate: RotateIcon,
  search: SearchIcon,
  undo: UndoIcon,
  redo: RedoIcon,
  text: TextIcon,
  sign: SignIcon,
  check: CheckIcon,
  close: CloseIcon,
  print: PrintIcon,
  duplicate: DuplicateIcon,
  trash: TrashIcon,
  smartFill: SmartFillIcon,
  hand: HandIcon,
  select: SelectIcon,
} as const;

export function Icon({
  name,
  ...props
}: IconProps & { name: IconName }) {
  if (name === "chevron") {
    return <ChevronIcon {...props} />;
  }
  const Cmp = iconMap[name];
  return <Cmp {...props} />;
}
