export type AppMode = "open" | "view" | "fill" | "add" | "sign";

export type ModeMeta = {
  id: AppMode;
  label: string;
  description: string;
  shortcut: string;
};

export const MODES: readonly ModeMeta[] = [
  {
    id: "open",
    label: "Open",
    description: "Open a PDF or drop a file to begin",
    shortcut: "Ctrl+O",
  },
  {
    id: "view",
    label: "View",
    description: "Navigate and inspect pages without editing",
    shortcut: "1",
  },
  {
    id: "fill",
    label: "Fill",
    description: "Fill interactive form fields",
    shortcut: "2",
  },
  {
    id: "add",
    label: "Add Text",
    description: "Place and edit free text annotations",
    shortcut: "3",
  },
  {
    id: "sign",
    label: "Sign",
    description: "Place visual signature images",
    shortcut: "4",
  },
] as const;

export function getModeMeta(id: AppMode): ModeMeta {
  const found = MODES.find((m) => m.id === id);
  if (!found) {
    throw new Error(`Unknown mode: ${id}`);
  }
  return found;
}
