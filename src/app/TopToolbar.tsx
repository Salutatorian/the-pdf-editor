import type { ChangeEvent, ReactElement } from 'react';
import {
  FileUp,
  Save,
  SaveAll,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  StretchHorizontal,
  RotateCw,
  Search,
  Printer,
  Sparkles,
  MousePointer2,
  Hand,
  Type,
  PenLine,
  Image as ImageIcon,
  CheckSquare,
  Calendar,
  Highlighter,
  Pencil,
  Square,
  ALargeSmall,
  Eraser,
  Wrench,
  FileArchive,
  Lock,
  Unlock,
  GitCompare,
  ScanText,
  Keyboard,
  Settings,
} from 'lucide-react';
import { RecentFilesMenu } from './RecentFilesMenu';
import { MODES, type AppMode } from './modes';
import type { OverlayKind, RecentFileEntry } from '../document/types';
import { ADD_MODE_TOOLS } from '../overlay/tools';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type AddTool = 'select' | 'hand' | OverlayKind;

export type TopToolbarProps = {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  dirty?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  zoomPercent?: number;
  searchQuery?: string;
  smartFill?: boolean;
  addTool?: AddTool;
  hasDocument?: boolean;
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitWidth?: () => void;
  onFitPage?: () => void;
  onRotate?: () => void;
  onPrint?: () => void;
  onSearchChange?: (query: string) => void;
  onSearchSubmit?: () => void;
  onSmartFillChange?: (enabled: boolean) => void;
  onAddToolChange?: (tool: AddTool) => void;
  /** Open signature pad from the Sign toolbar control */
  onRequestSignature?: () => void;
  onCompress?: () => void;
  onProtect?: () => void;
  onUnlock?: () => void;
  onCompare?: () => void;
  onOcr?: () => void;
  onShowShortcuts?: () => void;
  onOpenSettings?: () => void;
  /** Apple-style red badge on Settings when an update is available (no number). */
  updateAvailable?: boolean;
  recentFiles?: RecentFileEntry[];
  onOpenRecent?: (path: string, name: string) => void;
  onRemoveRecent?: (path: string) => void;
  onClearRecent?: () => void;
};

const ADD_TOOL_ICONS: Record<
  Exclude<AddTool, 'select' | 'hand' | 'signature'>,
  typeof Type
> = {
  text: Type,
  image: ImageIcon,
  checkmark: CheckSquare,
  date: Calendar,
  initials: ALargeSmall,
  highlight: Highlighter,
  draw: Pencil,
  shape: Square,
  redact: Eraser,
};

function Tip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
        {shortcut ? (
          <span className="ml-2 text-muted-foreground">{shortcut}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function TopToolbar({
  mode,
  onModeChange,
  dirty = false,
  canUndo = false,
  canRedo = false,
  zoomPercent = 100,
  searchQuery = '',
  smartFill = false,
  addTool = 'select',
  hasDocument = false,
  onOpen,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
  onRotate,
  onPrint,
  onSearchChange,
  onSearchSubmit,
  onSmartFillChange,
  onAddToolChange,
  onRequestSignature,
  onCompress,
  onProtect,
  onUnlock,
  onCompare,
  onOcr,
  onShowShortcuts,
  onOpenSettings,
  updateAvailable = false,
  recentFiles = [],
  onOpenRecent,
  onRemoveRecent,
  onClearRecent,
}: TopToolbarProps) {
  const onSearchInput = (e: ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(e.target.value);
  };

  const showAddTools = mode === 'add' || mode === 'sign';

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-w-0 flex-col" role="toolbar" aria-label="Main toolbar">
      <div className="flex h-11 min-w-0 items-center gap-2 overflow-x-auto px-2">
        <div className="flex items-baseline gap-1 px-2 pr-3">
          <span className="font-sans text-[14px] font-semibold tracking-tight text-foreground">
            pdf<span className="text-primary">_editor</span>
          </span>
          {dirty ? (
            <Badge
              variant="outline"
              className="ml-1 h-4 border-warning/40 px-1 text-[9px] text-warning"
            >
              unsaved
            </Badge>
          ) : null}
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div
          className="relative z-20 flex items-center rounded-md border border-border"
          role="group"
          aria-label="Application mode"
        >
          {MODES.filter((m) => m.id !== 'open').map((m, i, list) => {
            const selected = mode === m.id;
            return (
              <Button
                key={m.id}
                type="button"
                variant={selected ? 'secondary' : 'ghost'}
                size="sm"
                title={m.description}
                aria-pressed={selected}
                className={
                  i === 0
                    ? 'h-7 rounded-none rounded-l-md px-2.5 text-[11px]'
                    : i === list.length - 1
                      ? 'h-7 rounded-none rounded-r-md border-l border-border px-2.5 text-[11px]'
                      : 'h-7 rounded-none border-l border-border px-2.5 text-[11px]'
                }
                onClick={() => onModeChange(m.id)}
              >
                {m.label}
              </Button>
            );
          })}
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-0.5">
          <Tip label="Open another PDF (replaces current — does not merge)" shortcut="Ctrl+O">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open"
              onClick={onOpen}
            >
              <FileUp />
            </Button>
          </Tip>
          {onOpenRecent && onRemoveRecent && onClearRecent ? (
            <RecentFilesMenu
              files={recentFiles}
              onOpen={onOpenRecent}
              onRemove={onRemoveRecent}
              onClear={onClearRecent}
            />
          ) : null}
          <Tip label="Save" shortcut="Ctrl+S">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Save"
              className="relative"
              onClick={onSave}
            >
              <Save />
              {dirty ? (
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-warning" />
              ) : null}
            </Button>
          </Tip>
          <Tip label="Save As" shortcut="Ctrl+Shift+S">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Save As"
              onClick={onSaveAs}
            >
              <SaveAll />
            </Button>
          </Tip>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-0.5">
          <Tip label="Undo" shortcut="Ctrl+Z">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Undo2 />
            </Button>
          </Tip>
          <Tip label="Redo" shortcut="Ctrl+Y">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Redo2 />
            </Button>
          </Tip>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-0.5">
          <Tip label="Zoom out" shortcut="Ctrl+-">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              onClick={onZoomOut}
            >
              <ZoomOut />
            </Button>
          </Tip>
          <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(zoomPercent)}%
          </span>
          <Tip label="Zoom in" shortcut="Ctrl++">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom in"
              onClick={onZoomIn}
            >
              <ZoomIn />
            </Button>
          </Tip>
          <Tip label="Fit width" shortcut="Ctrl+1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Fit width"
              onClick={onFitWidth}
            >
              <StretchHorizontal />
            </Button>
          </Tip>
          <Tip label="Fit page" shortcut="Ctrl+0">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Fit page"
              onClick={onFitPage}
            >
              <Maximize2 />
            </Button>
          </Tip>
          <Tip label="Rotate">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Rotate page"
              onClick={onRotate}
            >
              <RotateCw />
            </Button>
          </Tip>
        </div>

        <div className="relative ml-1 hidden w-44 items-center md:flex">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search…"
            value={searchQuery}
            aria-label="Search document"
            className="h-7 pl-7 text-xs"
            onChange={onSearchInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearchSubmit?.();
            }}
          />
        </div>

        {mode === 'fill' ? (
          <>
            <Separator orientation="vertical" className="h-5" />
            <Tip label="Smart Fill">
              <Button
                variant={smartFill ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
                aria-pressed={smartFill}
                onClick={() => onSmartFillChange?.(!smartFill)}
              >
                <Sparkles className="size-3.5" />
                Smart Fill
              </Button>
            </Tip>
          </>
        ) : null}

        {hasDocument ? (
          <>
            <Separator orientation="vertical" className="h-5" />
            <div className="hidden items-center gap-0.5 lg:flex" role="group" aria-label="Tools">
              <Tip label="Compress">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Compress"
                  onClick={onCompress}
                >
                  <FileArchive />
                </Button>
              </Tip>
              <Tip label="Protect">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Protect PDF"
                  onClick={onProtect}
                >
                  <Lock />
                </Button>
              </Tip>
              <Tip label="Unlock">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Unlock PDF"
                  onClick={onUnlock}
                >
                  <Unlock />
                </Button>
              </Tip>
              <Tip label="Compare…">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Compare documents"
                  onClick={onCompare}
                >
                  <GitCompare />
                </Button>
              </Tip>
              <Tip label="OCR page">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="OCR page"
                  onClick={onOcr}
                >
                  <ScanText />
                </Button>
              </Tip>
            </div>
            <details className="relative lg:hidden">
              <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <Wrench className="size-3.5" />
                <span className="sr-only">Tools</span>
              </summary>
              <div className="absolute right-0 z-50 mt-1 flex min-w-[9rem] flex-col gap-0.5 rounded-md border border-border bg-card p-1 shadow-md">
                <Button variant="ghost" size="sm" className="justify-start text-[11px]" onClick={onCompress}>
                  Compress
                </Button>
                <Button variant="ghost" size="sm" className="justify-start text-[11px]" onClick={onProtect}>
                  Protect
                </Button>
                <Button variant="ghost" size="sm" className="justify-start text-[11px]" onClick={onUnlock}>
                  Unlock
                </Button>
                <Button variant="ghost" size="sm" className="justify-start text-[11px]" onClick={onCompare}>
                  Compare…
                </Button>
                <Button variant="ghost" size="sm" className="justify-start text-[11px]" onClick={onOcr}>
                  OCR page
                </Button>
              </div>
            </details>
          </>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Tip label="Keyboard shortcuts" shortcut="Ctrl+/">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Keyboard shortcuts"
              onClick={onShowShortcuts}
            >
              <Keyboard />
            </Button>
          </Tip>
          <Tip label="Settings">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                updateAvailable ? 'Settings — update available' : 'Settings'
              }
              className="relative"
              onClick={onOpenSettings}
            >
              <Settings />
              {updateAvailable ? (
                <span
                  className="absolute top-1 right-1 size-2 rounded-full bg-destructive ring-2 ring-card"
                  aria-hidden
                />
              ) : null}
            </Button>
          </Tip>
          <Tip label="Print" shortcut="Ctrl+P">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Print"
              onClick={onPrint}
            >
              <Printer />
            </Button>
          </Tip>
        </div>
      </div>

      {showAddTools ? (
        <div
          className="flex h-9 min-w-0 items-center gap-2 border-t border-border/70 bg-card/40 px-2"
          aria-label={mode === 'sign' ? 'Sign tools' : 'Add tools'}
        >
          <span className="shrink-0 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {mode === 'sign' ? 'Sign' : 'Add'}
          </span>
          <ToggleGroup
            type="single"
            value={addTool}
            onValueChange={(v) => {
              if (v) onAddToolChange?.(v as AddTool);
            }}
            variant="outline"
            size="sm"
            className="min-w-0 flex-1 flex-nowrap justify-start gap-0.5 overflow-x-auto"
          >
            <ToggleGroupItem value="select" aria-label="Select" className="size-7 shrink-0 p-0">
              <MousePointer2 className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="hand" aria-label="Pan" className="size-7 shrink-0 p-0">
              <Hand className="size-3.5" />
            </ToggleGroupItem>
            {mode === 'add'
              ? ADD_MODE_TOOLS.map((tool) => {
                  const Icon = ADD_TOOL_ICONS[tool.kind as keyof typeof ADD_TOOL_ICONS];
                  return (
                    <ToggleGroupItem
                      key={tool.id}
                      value={tool.kind}
                      aria-label={tool.label}
                      title={tool.label}
                      className="size-7 shrink-0 p-0"
                    >
                      {Icon ? <Icon className="size-3.5" /> : tool.label[0]}
                    </ToggleGroupItem>
                  );
                })
              : null}
            {mode === 'sign' ? (
              <ToggleGroupItem
                value="signature"
                aria-label="Signature"
                className="size-7 shrink-0 p-0"
                title="Draw signature"
                onClick={() => onRequestSignature?.()}
              >
                <PenLine className="size-3.5" />
              </ToggleGroupItem>
            ) : null}
          </ToggleGroup>
        </div>
      ) : null}
      </div>
    </TooltipProvider>
  );
}
