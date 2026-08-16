import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Stage,
  Layer,
  Rect,
  Text,
  Line,
  Image as KonvaImage,
  Transformer,
  Circle,
  Group,
} from 'react-konva';
import type Konva from 'konva';
import type { OverlayKind, OverlayObject, PathPoint } from '../document/types.ts';
import {
  snapToGuides,
  type AlignmentGuide,
  type SnapRect,
} from './alignment.ts';
import { toolByKind, type AddToolDef } from './tools.ts';

/** Bake Transformer scale into width/height so text/images don't stay stretched. */
function bakeTransformScale(node: Konva.Node): { width: number; height: number } {
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  const width = Math.max(4, node.width() * scaleX);
  const height = Math.max(4, node.height() * scaleY);
  node.scaleX(1);
  node.scaleY(1);
  node.width(width);
  node.height(height);

  if (node.getClassName() === 'Group') {
    const group = node as Konva.Group;
    for (const child of group.getChildren()) {
      const cls = child.getClassName();
      if (cls === 'Rect' || cls === 'Image') {
        child.width(width);
        child.height(height);
      } else if (cls === 'Text') {
        // Grow the layout box only — keep fontSize so glyphs never squash/stretch
        child.width(Math.max(4, width - 4));
        child.height(Math.max(4, height - 2));
      }
    }
  }

  return { width, height };
}

export type OverlayEditorProps = {
  pageIndex: number;
  width: number;
  height: number;
  scale: number;
  overlays: OverlayObject[];
  selectedIds: string[];
  /** Active place tool; null = select/move only */
  activeTool: OverlayKind | null;
  interactive?: boolean;
  onSelect: (ids: string[], additive?: boolean) => void;
  onAdd: (overlay: Omit<OverlayObject, 'id'> & { id?: string }) => string | void;
  onUpdate: (id: string, patch: Partial<OverlayObject>) => void;
  onRequestSignature?: (at: { x: number; y: number }) => void;
  /** Pick an image file and place it at page coords */
  onRequestImage?: (at: { x: number; y: number }) => void;
  /** Replace image/signature pixels on an existing overlay */
  onReplaceImage?: (overlayId: string) => void;
  /** Called after a place tool finishes so the UI can return to Select */
  onToolConsumed?: () => void;
};

function useHtmlImage(url: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => setImg(image);
    image.onerror = () => setImg(null);
    image.src = url;
  }, [url]);
  return img;
}

function OverlayNode({
  overlay,
  scale,
  draggable,
  selected,
  onSelect,
  onDblClick,
  onDragMove,
  onDragEnd,
  onTransform,
  onTransformEnd,
  nodeRefs,
}: {
  overlay: OverlayObject;
  scale: number;
  draggable: boolean;
  selected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDblClick?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransform?: (e: Konva.KonvaEventObject<Event>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  nodeRefs: Map<string, Konva.Node>;
}) {
  const img = useHtmlImage(overlay.imageDataUrl);
  const common = {
    id: overlay.id,
    x: overlay.x * scale,
    y: overlay.y * scale,
    width: overlay.width * scale,
    height: overlay.height * scale,
    rotation: overlay.rotation,
    draggable,
    opacity: overlay.opacity ?? 1,
    onClick: onSelect,
    onTap: onSelect,
    onDblClick,
    onDblTap: onDblClick,
    onDragMove,
    onDragEnd,
    onTransform,
    onTransformEnd,
    ref: (node: Konva.Node | null) => {
      if (node) nodeRefs.set(overlay.id, node);
      else nodeRefs.delete(overlay.id);
    },
  };

  switch (overlay.kind) {
    case 'text':
    case 'date':
    case 'initials': {
      const w = overlay.width * scale;
      const h = overlay.height * scale;
      const label =
        overlay.text ??
        (overlay.kind === 'date' ? new Date().toLocaleDateString() : '');
      const showFrame = selected || !label.trim();
      // Group + hit rect so empty / short text stays clickable and draggable
      // across the whole box, not just the glyph bounds.
      return (
        <Group
          id={overlay.id}
          x={overlay.x * scale}
          y={overlay.y * scale}
          width={w}
          height={h}
          rotation={overlay.rotation}
          draggable={draggable}
          opacity={overlay.opacity ?? 1}
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={onDblClick}
          onDblTap={onDblClick}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransform={onTransform}
          onTransformEnd={onTransformEnd}
          ref={(node) => {
            if (node) nodeRefs.set(overlay.id, node);
            else nodeRefs.delete(overlay.id);
          }}
        >
          <Rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill="rgba(0,0,0,0.001)"
            stroke={showFrame ? 'rgba(47, 127, 212, 0.45)' : undefined}
            strokeWidth={showFrame ? 1 : 0}
            dash={showFrame ? [4, 3] : undefined}
          />
          <Text
            x={2}
            y={1}
            width={Math.max(4, w - 4)}
            height={Math.max(4, h - 2)}
            text={label}
            fontSize={(overlay.fontSize ?? 14) * scale}
            fontFamily={overlay.fontFamily ?? 'IBM Plex Sans'}
            fontStyle={
              overlay.italic
                ? overlay.bold
                  ? 'italic bold'
                  : 'italic'
                : overlay.bold
                  ? 'bold'
                  : 'normal'
            }
            textDecoration={overlay.underline ? 'underline' : ''}
            fill={overlay.color ?? '#111111'}
            listening={false}
          />
        </Group>
      );
    }
    case 'highlight':
      return (
        <Rect
          {...common}
          fill={overlay.color ?? '#ffe566'}
          opacity={(overlay.opacity ?? 1) * 0.35}
        />
      );
    case 'redact':
      return (
        <Rect
          {...common}
          fill="#000000"
          opacity={1}
        />
      );
    case 'checkmark':
      return (
        <Text
          {...common}
          text="✓"
          fontSize={Math.min(overlay.width, overlay.height) * 0.85 * scale}
          fill={overlay.color ?? '#0a7a32'}
          align="center"
          verticalAlign="middle"
        />
      );
    case 'shape': {
      const shape = overlay.shapeType ?? 'rect';
      if (shape === 'ellipse') {
        return (
          <Circle
            id={overlay.id}
            x={(overlay.x + overlay.width / 2) * scale}
            y={(overlay.y + overlay.height / 2) * scale}
            radius={(Math.min(overlay.width, overlay.height) / 2) * scale}
            stroke={overlay.color ?? '#111111'}
            strokeWidth={(overlay.strokeWidth ?? 2) * scale}
            draggable={draggable}
            rotation={overlay.rotation}
            opacity={overlay.opacity ?? 1}
            onClick={onSelect}
            onTap={onSelect}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onTransform={onTransform}
            onTransformEnd={onTransformEnd}
            ref={(node) => {
              if (node) nodeRefs.set(overlay.id, node);
              else nodeRefs.delete(overlay.id);
            }}
          />
        );
      }
      if (shape === 'line') {
        return (
          <Line
            id={overlay.id}
            points={[
              overlay.x * scale,
              (overlay.y + overlay.height) * scale,
              (overlay.x + overlay.width) * scale,
              overlay.y * scale,
            ]}
            stroke={overlay.color ?? '#111111'}
            strokeWidth={(overlay.strokeWidth ?? 2) * scale}
            draggable={draggable}
            onClick={onSelect}
            onTap={onSelect}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            ref={(node) => {
              if (node) nodeRefs.set(overlay.id, node);
              else nodeRefs.delete(overlay.id);
            }}
          />
        );
      }
      return (
        <Rect
          {...common}
          stroke={overlay.color ?? '#111111'}
          strokeWidth={(overlay.strokeWidth ?? 2) * scale}
          fillEnabled={false}
        />
      );
    }
    case 'draw': {
      const pts = overlay.pathPoints ?? [];
      const flat = pts.flatMap((p) => [p.x * scale, p.y * scale]);
      return (
        <Line
          id={overlay.id}
          points={flat}
          stroke={overlay.color ?? '#111111'}
          strokeWidth={(overlay.strokeWidth ?? 2) * scale}
          tension={0.2}
          lineCap="round"
          lineJoin="round"
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          ref={(node) => {
            if (node) nodeRefs.set(overlay.id, node);
            else nodeRefs.delete(overlay.id);
          }}
        />
      );
    }
    case 'image':
    case 'signature': {
      const w = overlay.width * scale;
      const h = overlay.height * scale;
      // Single draggable group so the ink and its frame never desync.
      return (
        <Group
          id={overlay.id}
          x={overlay.x * scale}
          y={overlay.y * scale}
          width={w}
          height={h}
          rotation={overlay.rotation}
          draggable={draggable}
          opacity={overlay.opacity ?? 1}
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={onDblClick}
          onDblTap={onDblClick}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransform={onTransform}
          onTransformEnd={onTransformEnd}
          ref={(node) => {
            if (node) nodeRefs.set(overlay.id, node);
            else nodeRefs.delete(overlay.id);
          }}
        >
          {img ? (
            <KonvaImage x={0} y={0} width={w} height={h} image={img} />
          ) : (
            <Rect
              x={0}
              y={0}
              width={w}
              height={h}
              fill="#e8eaed"
              stroke="#9aa3ad"
              dash={[4, 4]}
            />
          )}
        </Group>
      );
    }
    default: {
      const _exhaustive: never = overlay.kind;
      return _exhaustive;
    }
  }
}

function defaultOverlayFromTool(
  tool: AddToolDef,
  pageIndex: number,
  x: number,
  y: number,
  zIndex: number,
): Omit<OverlayObject, 'id'> {
  const today = new Date().toLocaleDateString();
  const base: Omit<OverlayObject, 'id'> = {
    pageIndex,
    kind: tool.kind,
    x,
    y,
    width: tool.defaultWidth,
    height: tool.defaultHeight,
    rotation: 0,
    zIndex,
    color: tool.kind === 'highlight' ? '#ffe566' : '#111111',
    opacity: 1,
  };
  switch (tool.kind) {
    case 'text':
      return { ...base, text: '', fontSize: 14 };
    case 'date':
      return { ...base, text: today, fontSize: 14 };
    case 'initials':
      return { ...base, text: 'AB', fontSize: 16 };
    case 'checkmark':
      return { ...base, text: '✓' };
    case 'shape':
      return { ...base, shapeType: 'rect', strokeWidth: 2 };
    case 'draw':
      return { ...base, pathPoints: [], strokeWidth: 2 };
    case 'highlight':
    case 'image':
    case 'signature':
      return base;
    case 'redact':
      return { ...base, color: '#000000', opacity: 1 };
    default: {
      const _exhaustive: never = tool.kind;
      return _exhaustive;
    }
  }
}

export function OverlayEditor({
  pageIndex,
  width,
  height,
  scale,
  overlays,
  selectedIds,
  activeTool,
  interactive = true,
  onSelect,
  onAdd,
  onUpdate,
  onRequestSignature,
  onRequestImage,
  onReplaceImage,
  onToolConsumed,
}: OverlayEditorProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);
  const [drawing, setDrawing] = useState<PathPoint[] | null>(null);
  const [highlightDraft, setHighlightDraft] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  const pageOverlays = useMemo(
    () =>
      overlays
        .filter((o) => o.pageIndex === pageIndex)
        .sort((a, b) => a.zIndex - b.zIndex),
    [overlays, pageIndex],
  );

  const editingOverlay = editingId
    ? pageOverlays.find((o) => o.id === editingId) ?? null
    : null;

  useEffect(() => {
    if (!editingId) return;
    const stillThere = overlays.some((o) => o.id === editingId);
    if (!stillThere) setEditingId(null);
  }, [overlays, editingId]);

  useEffect(() => {
    if (!editingOverlay) return;
    const el = editRef.current;
    if (!el) return;
    const focusCaret = () => {
      el.focus({ preventScroll: true });
      const len = el.value.length;
      el.setSelectionRange(len, len);
    };
    focusCaret();
    const t0 = window.setTimeout(focusCaret, 0);
    const t1 = window.setTimeout(focusCaret, 40);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [editingOverlay?.id]);

  const beginEdit = (overlay: OverlayObject) => {
    if (
      overlay.kind === 'image' ||
      overlay.kind === 'signature'
    ) {
      onSelect([overlay.id]);
      onReplaceImage?.(overlay.id);
      return;
    }
    if (
      overlay.kind !== 'text' &&
      overlay.kind !== 'date' &&
      overlay.kind !== 'initials'
    ) {
      return;
    }
    onSelect([overlay.id]);
    setEditDraft(
      overlay.text ??
        (overlay.kind === 'date' ? new Date().toLocaleDateString() : ''),
    );
    setEditingId(overlay.id);
  };

  const commitEdit = (opts?: { consumeTool?: boolean }) => {
    if (!editingId) return;
    onUpdate(editingId, { text: editDraft });
    setEditingId(null);
    // Don't auto-switch to Select on blur — that ate the next click meant to
    // place another text box. Only consume when the user explicitly finishes.
    if (opts?.consumeTool) onToolConsumed?.();
  };

  const clickedEmptyStage = (target: Konva.Node, stage: Konva.Stage) => {
    // Empty hits often land on Layer, not Stage — both count as "page".
    return target === stage || target.getType() === 'Layer';
  };

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, pageOverlays]);

  const stageW = width * scale;
  const stageH = height * scale;

  const toPagePoint = (stageX: number, stageY: number) => ({
    x: stageX / scale,
    y: stageY / scale,
  });

  const otherRects = (excludeId: string): SnapRect[] =>
    pageOverlays
      .filter((o) => o.id !== excludeId)
      .map((o) => ({
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
      }));

  const placeTextLikeTool = (toolKind: OverlayKind, x: number, y: number) => {
    const tool = toolByKind(toolKind);
    if (!tool) return;
    const zIndex =
      pageOverlays.reduce((m, o) => Math.max(m, o.zIndex), 0) + 1;
    const created = defaultOverlayFromTool(tool, pageIndex, x, y, zIndex);
    const id = onAdd(created);
    if (
      typeof id === 'string' &&
      (created.kind === 'text' ||
        created.kind === 'date' ||
        created.kind === 'initials')
    ) {
      setEditDraft(created.text ?? '');
      setEditingId(id);
      // Stay on the text tool so the next click places another field.
      return;
    }
    onToolConsumed?.();
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!interactive) return;
    const stage = e.target.getStage();
    if (!stage) return;
    if (!clickedEmptyStage(e.target, stage)) return;

    if (!activeTool) {
      onSelect([]);
      return;
    }
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { x, y } = toPagePoint(pos.x, pos.y);

    if (activeTool === 'signature') {
      onRequestSignature?.({ x, y });
      return;
    }
    if (activeTool === 'image') {
      onRequestImage?.({ x, y });
      return;
    }
    if (activeTool === 'draw' || activeTool === 'highlight' || activeTool === 'redact') {
      return;
    }

    placeTextLikeTool(activeTool, x, y);
  };

  const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (!interactive) return;
    e.evt.preventDefault();
    e.evt.stopPropagation();
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { x, y } = toPagePoint(pos.x, pos.y);

    // Right-click on existing text → type immediately
    const hit = pageOverlays.find(
      (o) =>
        (o.kind === 'text' || o.kind === 'date' || o.kind === 'initials') &&
        x >= o.x &&
        x <= o.x + o.width &&
        y >= o.y &&
        y <= o.y + o.height,
    );
    if (hit) {
      beginEdit(hit);
      return;
    }

    // Right-click empty page while Text/Date/Initials is armed → place & type
    if (
      activeTool === 'text' ||
      activeTool === 'date' ||
      activeTool === 'initials'
    ) {
      placeTextLikeTool(activeTool, x, y);
    }
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!interactive || !activeTool) return;
    const stage = e.target.getStage();
    if (!stage || !clickedEmptyStage(e.target, stage)) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const pt = toPagePoint(pos.x, pos.y);
    if (activeTool === 'draw') {
      setDrawing([pt]);
    } else if (activeTool === 'highlight' || activeTool === 'redact') {
      setHighlightDraft({ x: pt.x, y: pt.y, width: 0, height: 0 });
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const pt = toPagePoint(pos.x, pos.y);
    if (drawing) {
      setDrawing([...drawing, pt]);
    } else if (highlightDraft) {
      setHighlightDraft({
        x: highlightDraft.x,
        y: highlightDraft.y,
        width: pt.x - highlightDraft.x,
        height: pt.y - highlightDraft.y,
      });
    }
  };

  const handleMouseUp = () => {
    if (drawing && drawing.length > 1) {
      const xs = drawing.map((p) => p.x);
      const ys = drawing.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const zIndex =
        pageOverlays.reduce((m, o) => Math.max(m, o.zIndex), 0) + 1;
      onAdd({
        pageIndex,
        kind: 'draw',
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        rotation: 0,
        zIndex,
        pathPoints: drawing,
        color: '#111111',
        strokeWidth: 2,
      });
      onToolConsumed?.();
    }
    if (highlightDraft) {
      const x = Math.min(highlightDraft.x, highlightDraft.x + highlightDraft.width);
      const y = Math.min(highlightDraft.y, highlightDraft.y + highlightDraft.height);
      const w = Math.abs(highlightDraft.width);
      const h = Math.abs(highlightDraft.height);
      if (w > 2 && h > 2) {
        const zIndex =
          pageOverlays.reduce((m, o) => Math.max(m, o.zIndex), 0) + 1;
        const isRedact = activeTool === 'redact';
        onAdd({
          pageIndex,
          kind: isRedact ? 'redact' : 'highlight',
          x,
          y,
          width: w,
          height: h,
          rotation: 0,
          zIndex,
          color: isRedact ? '#000000' : '#ffe566',
          opacity: 1,
        });
        onToolConsumed?.();
      }
    }
    setDrawing(null);
    setHighlightDraft(null);
  };

  return (
    <div className="overlay-editor-root" style={{ position: 'absolute', inset: 0 }}>
    <Stage
      ref={stageRef}
      width={stageW}
      height={stageH}
      className="overlay-editor"
      listening={interactive}
      onClick={handleStageClick}
      onTap={handleStageClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      <Layer>
        {pageOverlays.map((overlay) => (
          <Group key={overlay.id} visible={overlay.id !== editingId}>
            <OverlayNode
              overlay={overlay}
              scale={scale}
              selected={selectedIds.includes(overlay.id)}
              draggable={interactive && !editingId}
              nodeRefs={nodeRefs.current}
              onSelect={(e) => {
                e.cancelBubble = true;
                const additive =
                  e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
                // Single click selects so the box can be dragged; double-click types.
                onSelect([overlay.id], additive);
              }}
              onDblClick={(e) => {
                e.cancelBubble = true;
                if (!interactive) return;
                beginEdit(overlay);
              }}
              onDragMove={(e) => {
                const node = e.target;
                const rawX = node.x() / scale;
                const rawY = node.y() / scale;
                const snapped = snapToGuides(
                  rawX,
                  rawY,
                  overlay.width,
                  overlay.height,
                  otherRects(overlay.id),
                );
                node.x(snapped.x * scale);
                node.y(snapped.y * scale);
                setGuides(snapped.guides);
              }}
              onDragEnd={(e) => {
                const node = e.target;
                setGuides([]);
                onUpdate(overlay.id, {
                  x: node.x() / scale,
                  y: node.y() / scale,
                });
              }}
              onTransform={(e) => {
                // Live: convert scale → box size so text never looks stretched mid-drag
                bakeTransformScale(e.target);
              }}
              onTransformEnd={(e) => {
                const node = e.target;
                const { width, height } = bakeTransformScale(node);
                onUpdate(overlay.id, {
                  x: node.x() / scale,
                  y: node.y() / scale,
                  width: width / scale,
                  height: height / scale,
                  rotation: node.rotation(),
                });
              }}
            />
          </Group>
        ))}

        {drawing && drawing.length > 1 ? (
          <Line
            points={drawing.flatMap((p) => [p.x * scale, p.y * scale])}
            stroke="#111111"
            strokeWidth={2 * scale}
            tension={0.2}
            lineCap="round"
          />
        ) : null}

        {highlightDraft ? (
          <Rect
            x={Math.min(highlightDraft.x, highlightDraft.x + highlightDraft.width) * scale}
            y={Math.min(highlightDraft.y, highlightDraft.y + highlightDraft.height) * scale}
            width={Math.abs(highlightDraft.width) * scale}
            height={Math.abs(highlightDraft.height) * scale}
            fill={activeTool === 'redact' ? '#000000' : '#ffe566'}
            opacity={activeTool === 'redact' ? 1 : 0.35}
          />
        ) : null}

        {guides.map((g, i) =>
          g.orientation === 'vertical' ? (
            <Line
              key={`vg-${i}`}
              points={[g.position * scale, 0, g.position * scale, stageH]}
              stroke="#3d8bfd"
              strokeWidth={1}
              dash={[4, 4]}
            />
          ) : (
            <Line
              key={`hg-${i}`}
              points={[0, g.position * scale, stageW, g.position * scale]}
              stroke="#3d8bfd"
              strokeWidth={1}
              dash={[4, 4]}
            />
          ),
        )}

        {interactive && !editingId ? (
          <Transformer
            ref={trRef}
            rotateEnabled
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 4 || newBox.height < 4) return oldBox;
              return newBox;
            }}
          />
        ) : null}
      </Layer>
    </Stage>
    {editingOverlay ? (
      <textarea
        ref={editRef}
        className="overlay-text-editor"
        value={editDraft}
        placeholder="Type here…"
        aria-label="Edit text"
        style={{
          position: 'absolute',
          left: editingOverlay.x * scale,
          top: editingOverlay.y * scale,
          width: Math.max(editingOverlay.width * scale, 64),
          height: Math.max(editingOverlay.height * scale, 24),
          fontSize: (editingOverlay.fontSize ?? 14) * scale,
          fontFamily: editingOverlay.fontFamily ?? 'IBM Plex Sans',
          fontWeight: editingOverlay.bold ? 700 : 400,
          fontStyle: editingOverlay.italic ? 'italic' : 'normal',
          textDecoration: editingOverlay.underline ? 'underline' : 'none',
          color: editingOverlay.color ?? '#111111',
          lineHeight: 1.2,
          margin: 0,
          padding: '1px 2px',
          border: '1px solid rgba(47, 127, 212, 0.85)',
          borderRadius: 2,
          background: 'transparent',
          caretColor: editingOverlay.color ?? '#111111',
          resize: 'none',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          zIndex: 5,
          boxSizing: 'border-box',
          outline: 'none',
          boxShadow: 'none',
        }}
        onChange={(e) => setEditDraft(e.target.value)}
        onBlur={() => commitEdit()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditingId(null);
            onToolConsumed?.();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitEdit({ consumeTool: true });
          }
        }}
      />
    ) : null}
    </div>
  );
}
