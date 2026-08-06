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
  onAdd: (overlay: Omit<OverlayObject, 'id'> & { id?: string }) => void;
  onUpdate: (id: string, patch: Partial<OverlayObject>) => void;
  onRequestSignature?: (at: { x: number; y: number }) => void;
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
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  nodeRefs,
}: {
  overlay: OverlayObject;
  scale: number;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
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
    onDragMove,
    onDragEnd,
    onTransformEnd,
    ref: (node: Konva.Node | null) => {
      if (node) nodeRefs.set(overlay.id, node);
      else nodeRefs.delete(overlay.id);
    },
  };

  switch (overlay.kind) {
    case 'text':
    case 'date':
    case 'initials':
      return (
        <Text
          {...common}
          text={overlay.text ?? (overlay.kind === 'date' ? new Date().toLocaleDateString() : '')}
          fontSize={(overlay.fontSize ?? 14) * scale}
          fontFamily={overlay.fontFamily ?? 'IBM Plex Sans'}
          fill={overlay.color ?? '#111111'}
        />
      );
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
    case 'signature':
      return img ? (
        <KonvaImage {...common} image={img} />
      ) : (
        <Rect {...common} fill="#e8eaed" stroke="#9aa3ad" dash={[4, 4]} />
      );
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
      return { ...base, text: 'Text', fontSize: 14 };
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

  const pageOverlays = useMemo(
    () =>
      overlays
        .filter((o) => o.pageIndex === pageIndex)
        .sort((a, b) => a.zIndex - b.zIndex),
    [overlays, pageIndex],
  );

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

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!interactive) return;
    const stage = e.target.getStage();
    if (!stage) return;
    if (e.target === stage) {
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
      if (activeTool === 'draw' || activeTool === 'highlight' || activeTool === 'redact') {
        return;
      }

      const tool = toolByKind(activeTool);
      if (!tool) return;
      const zIndex =
        pageOverlays.reduce((m, o) => Math.max(m, o.zIndex), 0) + 1;
      onAdd(defaultOverlayFromTool(tool, pageIndex, x, y, zIndex));
    }
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!interactive || !activeTool) return;
    const stage = e.target.getStage();
    if (!stage || e.target !== stage) return;
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
      }
    }
    setDrawing(null);
    setHighlightDraft(null);
  };

  return (
    <Stage
      ref={stageRef}
      width={stageW}
      height={stageH}
      className="overlay-editor"
      onClick={handleStageClick}
      onTap={handleStageClick}
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
          <Group key={overlay.id}>
            <OverlayNode
              overlay={overlay}
              scale={scale}
              draggable={interactive && !activeTool}
              nodeRefs={nodeRefs.current}
              onSelect={(e) => {
                e.cancelBubble = true;
                onSelect(
                  [overlay.id],
                  e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey,
                );
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
              onTransformEnd={(e) => {
                const node = e.target;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                onUpdate(overlay.id, {
                  x: node.x() / scale,
                  y: node.y() / scale,
                  width: Math.max(4, (node.width() * scaleX) / scale),
                  height: Math.max(4, (node.height() * scaleY) / scale),
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

        {interactive && !activeTool ? (
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
  );
}
