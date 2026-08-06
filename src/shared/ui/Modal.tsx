import {
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Button } from "./Button";
import { CloseIcon } from "./Icon";

export type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
} & Omit<HTMLAttributes<HTMLDivElement>, "title">;

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
  initialFocusRef,
  className = "",
  ...rest
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const focusTarget =
      initialFocusRef?.current ??
      dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );

    focusTarget?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return (
    <div className="modal-root" role="presentation">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? "modal--wide" : ""} ${className}`.trim()}
        {...rest}
      >
        <header className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon />
          </Button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
