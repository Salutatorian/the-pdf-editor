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
} from 'lucide-react';
import { MODES, type AppMode } from './modes';
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

export type AddTool = 'select' | 'text' | 'sign' | 'hand';

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
}: TopToolbarProps) {
  const onSearchInput = (e: ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(e.target.value);
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className="flex h-11 items-center gap-2 px-2"
        role="toolbar"
        aria-label="Main toolbar"
      >
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

        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => {
            if (v) onModeChange(v as AppMode);
          }}
          variant="outline"
          size="sm"
          className="hidden gap-0 sm:flex"
          aria-label="Application mode"
        >
          {MODES.filter((m) => m.id !== 'open').map((m) => (
            <ToggleGroupItem
              key={m.id}
              value={m.id}
              className="h-7 px-2.5 text-[11px]"
              title={m.description}
            >
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-0.5">
          <Tip label="Open" shortcut="Ctrl+O">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open"
              onClick={onOpen}
            >
              <FileUp />
            </Button>
          </Tip>
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
          <Tip label="Zoom out">
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
          <Tip label="Zoom in">
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

        {mode === 'add' || mode === 'sign' ? (
          <>
            <Separator orientation="vertical" className="h-5" />
            <ToggleGroup
              type="single"
              value={addTool}
              onValueChange={(v) => {
                if (v) onAddToolChange?.(v as AddTool);
              }}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="select" aria-label="Select" className="size-7 p-0">
                <MousePointer2 className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="hand" aria-label="Pan" className="size-7 p-0">
                <Hand className="size-3.5" />
              </ToggleGroupItem>
              {mode === 'add' ? (
                <ToggleGroupItem value="text" aria-label="Text" className="size-7 p-0">
                  <Type className="size-3.5" />
                </ToggleGroupItem>
              ) : null}
              {mode === 'sign' ? (
                <ToggleGroupItem
                  value="sign"
                  aria-label="Signature"
                  className="size-7 p-0"
                >
                  <PenLine className="size-3.5" />
                </ToggleGroupItem>
              ) : null}
            </ToggleGroup>
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-0.5">
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
    </TooltipProvider>
  );
}
