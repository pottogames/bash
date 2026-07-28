import DxfParser from 'dxf-parser';
import type {
  CanonicalPlan,
  DimensionEntity,
  Layer,
  PlanEntity,
  PlanWarning,
  Vec2,
} from '@plan2quote/core';
import { bounds as boundsOf } from '@plan2quote/geometry';
import { resolveScale } from './scale.js';
import {
  applyMatrix,
  compose,
  IDENTITY,
  insertMatrix,
  isAnisotropic,
  isMirrored,
  rotationOf,
  uniformScale,
  type Matrix,
} from './transform.js';

/**
 * DXF reader.
 *
 * DXF is the format worth doing properly: it is the only common input where
 * layers are real named records rather than something inferred, and where the
 * file states its own units. Everything the system knows best, it knows because
 * it came from here.
 *
 * The parse runs in the drawing's own units and converts to metres exactly once
 * at the end, after the scale has been resolved and audited — so the dimension
 * cross-check compares numbers in the units the dimensions were written in.
 */

export interface ParseDxfOptions {
  sourceName: string;
  /** How deep to follow nested block definitions. */
  maxBlockDepth?: number;
  /** Cap on expanded entities, so a pathological file cannot exhaust memory. */
  maxEntities?: number;
}

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ENTITIES = 500_000;

interface RawEntity {
  type?: string;
  layer?: string;
  handle?: number | string;
  [key: string]: unknown;
}

export function parseDxf(content: string, options: ParseDxfOptions): CanonicalPlan {
  const parser = new DxfParser();
  const dxf = parser.parseSync(content);
  if (!dxf) throw new Error('parseDxf: הקובץ אינו DXF תקין או שאינו ניתן לקריאה.');

  const warnings: PlanWarning[] = [];
  const maxDepth = options.maxBlockDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntities = options.maxEntities ?? DEFAULT_MAX_ENTITIES;

  // `dxf-parser` types entities as a closed interface; we read them as loose
  // records because the fields present vary by entity type and we branch on
  // `type` anyway. The double cast is the honest way to say that.
  const blocks = (dxf.blocks ?? {}) as unknown as Record<
    string,
    { entities?: RawEntity[]; position?: Vec2 }
  >;

  const entities: PlanEntity[] = [];
  let counter = 0;
  const nextId = () => `dxf-${++counter}`;
  const unsupported = new Map<string, number>();

  const emit = (entity: PlanEntity): void => {
    if (entities.length >= maxEntities) return;
    entities.push(entity);
  };

  /**
   * Walks a list of raw DXF entities, resolving INSERTs by recursing into the
   * block definition with the composed transform.
   *
   * `openBlocks` is the cycle guard. A block that references itself is invalid
   * but does occur in files that have been through a bad converter, and without
   * this the recursion never returns.
   */
  const walk = (
    list: readonly RawEntity[],
    matrix: Matrix,
    blockPath: string[],
    openBlocks: ReadonlySet<string>,
  ): void => {
    for (const raw of list) {
      if (entities.length >= maxEntities) return;

      const layerKey = typeof raw.layer === 'string' && raw.layer.length > 0 ? raw.layer : '0';
      const handle = raw.handle === undefined ? undefined : String(raw.handle);
      const base = { layerKey, blockPath: [...blockPath], handle };

      switch (raw.type) {
        case 'LINE': {
          const verts = (raw.vertices as Vec2[] | undefined) ?? [];
          if (verts.length < 2) break;
          emit({
            ...base,
            id: nextId(),
            kind: 'polyline',
            vertices: verts.map((v) => applyMatrix(matrix, v)),
            closed: false,
          });
          break;
        }

        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const verts = (raw.vertices as (Vec2 & { bulge?: number })[] | undefined) ?? [];
          if (verts.length < 2) break;
          const bulges = verts.map((v) => v.bulge ?? 0);
          // A mirrored transform reverses the direction every arc turns, so the
          // bulge signs have to flip with it or curved walls bow the wrong way.
          const mirrored = isMirrored(matrix);
          emit({
            ...base,
            id: nextId(),
            kind: 'polyline',
            vertices: verts.map((v) => applyMatrix(matrix, v)),
            closed: raw.shape === true,
            ...(bulges.some((b) => b !== 0)
              ? { bulges: mirrored ? bulges.map((b) => -b) : bulges }
              : {}),
          });
          break;
        }

        case 'CIRCLE': {
          const center = raw.center as Vec2 | undefined;
          const radius = raw.radius as number | undefined;
          if (!center || !radius) break;
          if (isAnisotropic(matrix)) {
            warnings.push({
              code: 'unsupported_entity',
              message: 'עיגול בתוך בלוק שנמתח בצירים שונים הפך לאליפסה — נמדד לפי רדיוס ממוצע.',
              ref: handle,
            });
          }
          emit({
            ...base,
            id: nextId(),
            kind: 'circle',
            center: applyMatrix(matrix, center),
            radius: radius * uniformScale(matrix),
          });
          break;
        }

        case 'ARC': {
          const center = raw.center as Vec2 | undefined;
          const radius = raw.radius as number | undefined;
          if (!center || radius === undefined) break;
          const rot = rotationOf(matrix);
          const start = (raw.startAngle as number) ?? 0;
          const end = (raw.endAngle as number) ?? 0;
          const mirrored = isMirrored(matrix);
          emit({
            ...base,
            id: nextId(),
            kind: 'arc',
            center: applyMatrix(matrix, center),
            radius: radius * uniformScale(matrix),
            // Mirroring swaps which end the sweep runs from.
            startAngle: mirrored ? -end + rot : start + rot,
            endAngle: mirrored ? -start + rot : end + rot,
          });
          break;
        }

        case 'POINT': {
          const position = raw.position as Vec2 | undefined;
          if (!position) break;
          emit({ ...base, id: nextId(), kind: 'point', position: applyMatrix(matrix, position) });
          break;
        }

        case 'TEXT':
        case 'MTEXT': {
          const position = (raw.startPoint ?? raw.position) as Vec2 | undefined;
          const value = (raw.text as string | undefined) ?? '';
          if (!position) break;
          emit({
            ...base,
            id: nextId(),
            kind: 'text',
            position: applyMatrix(matrix, position),
            value,
            height: ((raw.textHeight ?? raw.height) as number | undefined ?? 0) * uniformScale(matrix),
            rotation: ((raw.rotation as number | undefined) ?? 0) + rotationOf(matrix),
          });
          break;
        }

        case 'SOLID': {
          const points = (raw.points as Vec2[] | undefined) ?? [];
          if (points.length < 3) break;
          // A SOLID's four corners are stored in a Z order, not around the
          // outline — swapping the last two is what makes it a simple polygon.
          const ordered = points.length === 4 ? [points[0]!, points[1]!, points[3]!, points[2]!] : points;
          emit({
            ...base,
            id: nextId(),
            kind: 'polyline',
            vertices: ordered.map((p) => applyMatrix(matrix, p)),
            closed: true,
          });
          break;
        }

        case 'DIMENSION': {
          const p1 = raw.linearOrAngularPoint1 as Vec2 | undefined;
          const p2 = raw.linearOrAngularPoint2 as Vec2 | undefined;
          const text = (raw.text as string | undefined) ?? '';
          if (!p1 || !p2) break;
          emit({
            ...base,
            id: nextId(),
            kind: 'dimension',
            from: applyMatrix(matrix, p1),
            to: applyMatrix(matrix, p2),
            text,
            // Only a *typed override* is evidence about scale. The DXF's own
            // `actualMeasurement` is computed from the same points we already
            // have, so comparing it against them proves nothing.
            displayedValue: parseDimensionText(text),
          });
          break;
        }

        case 'INSERT': {
          const name = raw.name as string | undefined;
          const position = (raw.position as Vec2 | undefined) ?? { x: 0, y: 0 };
          const placed = applyMatrix(matrix, position);
          const rotationDeg = (raw.rotation as number | undefined) ?? 0;
          const xScale = (raw.xScale as number | undefined) ?? 1;
          const yScale = (raw.yScale as number | undefined) ?? 1;

          // The marker is what `count` sums. It exists whether or not the block
          // definition can be resolved, so a missing block never loses a socket.
          emit({
            ...base,
            id: nextId(),
            kind: 'block',
            name: name ?? 'UNNAMED',
            position: placed,
            rotation: (rotationDeg * Math.PI) / 180 + rotationOf(matrix),
            scale: { x: xScale, y: yScale },
          });

          if (!name) break;
          const block = blocks[name];
          if (!block?.entities) break;
          if (openBlocks.has(name)) {
            warnings.push({
              code: 'unsupported_entity',
              message: `הבלוק "${name}" מפנה לעצמו — ההרחבה נעצרה כדי למנוע לולאה אינסופית.`,
            });
            break;
          }
          if (blockPath.length >= maxDepth) {
            warnings.push({
              code: 'unsupported_entity',
              message: `עומק קינון בלוקים חרג מ-${maxDepth} — "${name}" לא הורחב.`,
            });
            break;
          }

          // MINSERT: one entity standing for a rectangular array of copies.
          const columns = Math.max(1, (raw.columnCount as number | undefined) ?? 1);
          const rows = Math.max(1, (raw.rowCount as number | undefined) ?? 1);
          const columnSpacing = (raw.columnSpacing as number | undefined) ?? 0;
          const rowSpacing = (raw.rowSpacing as number | undefined) ?? 0;

          // The block's base point is its own origin; contents are drawn
          // relative to it, so it has to be subtracted before placing.
          const basePoint = block.position ?? { x: 0, y: 0 };
          const nested = new Set([...openBlocks, name]);

          for (let col = 0; col < columns; col++) {
            for (let row = 0; row < rows; row++) {
              const offset: Vec2 = {
                x: position.x + col * columnSpacing,
                y: position.y + row * rowSpacing,
              };
              const local = insertMatrix(
                offset,
                (rotationDeg * Math.PI) / 180,
                xScale,
                yScale,
              );
              const shifted = compose(local, {
                ...IDENTITY,
                e: -basePoint.x,
                f: -basePoint.y,
              });
              if (col > 0 || row > 0) {
                emit({
                  ...base,
                  id: nextId(),
                  kind: 'block',
                  name,
                  position: applyMatrix(compose(matrix, local), { x: 0, y: 0 }),
                  rotation: (rotationDeg * Math.PI) / 180 + rotationOf(matrix),
                  scale: { x: xScale, y: yScale },
                });
              }
              walk(block.entities, compose(matrix, shifted), [...blockPath, name], nested);
            }
          }
          break;
        }

        case 'ELLIPSE':
        case 'SPLINE':
        case '3DFACE':
        case 'ATTDEF':
        default: {
          const type = raw.type ?? 'UNKNOWN';
          unsupported.set(type, (unsupported.get(type) ?? 0) + 1);
          break;
        }
      }
    }
  };

  walk((dxf.entities ?? []) as unknown as RawEntity[], IDENTITY, [], new Set());

  for (const [type, count] of unsupported) {
    warnings.push({
      code: 'unsupported_entity',
      message:
        `${count} ישויות מסוג ${type} לא נקראו. הן לא ייכללו בכתב הכמויות — ` +
        'עדיף לפוצץ (explode) אותן בקובץ המקור מאשר להעריך את הכמות שלהן.',
    });
  }

  if (entities.length >= maxEntities) {
    warnings.push({
      code: 'unsupported_entity',
      message: `הקובץ חרג מ-${maxEntities} ישויות והקריאה נעצרה. כתב הכמויות יהיה חלקי.`,
    });
  }

  /* ---------------------------------------------------- scale, then convert */

  const dimensions = entities.filter((e): e is DimensionEntity => e.kind === 'dimension');
  const rawBounds = boundsOf(collectPoints(entities));
  const insunits = (dxf.header as Record<string, number> | undefined)?.['$INSUNITS'];
  const { scale, warnings: scaleWarnings } = resolveScale(insunits, dimensions, rawBounds);
  warnings.push(...scaleWarnings);

  const factor = scale.metresPerSourceUnit;
  const converted = factor === 1 ? entities : entities.map((e) => scaleEntity(e, factor));

  /* ------------------------------------------------------------------ layers */

  const entityCounts = new Map<string, number>();
  for (const e of converted) entityCounts.set(e.layerKey, (entityCounts.get(e.layerKey) ?? 0) + 1);

  const declared = (dxf.tables?.layer?.layers ?? {}) as Record<
    string,
    { name?: string; visible?: boolean; frozen?: boolean; color?: number }
  >;

  const layers: Layer[] = Object.entries(declared).map(([key, layer]) => ({
    sourceKey: key,
    sourceName: layer.name ?? key,
    color: layer.color === undefined ? undefined : `#${(layer.color & 0xffffff).toString(16).padStart(6, '0')}`,
    frozen: layer.frozen === true,
    visible: layer.visible !== false,
    entityCount: entityCounts.get(key) ?? 0,
  }));

  // Entities can reference a layer the LAYER table never declared. Losing them
  // would silently drop quantities, so the layer is synthesised instead.
  for (const [key, count] of entityCounts) {
    if (layers.some((l) => l.sourceKey === key)) continue;
    layers.push({ sourceKey: key, sourceName: key, frozen: false, visible: true, entityCount: count });
    warnings.push({
      code: 'unsupported_entity',
      message: `השכבה "${key}" מופיעה בישויות אך לא בטבלת השכבות של הקובץ. נוצרה אוטומטית.`,
      ref: key,
    });
  }

  for (const layer of layers) {
    if (layer.entityCount === 0) {
      warnings.push({ code: 'empty_layer', message: `השכבה "${layer.sourceName}" ריקה.`, ref: layer.sourceKey });
    }
  }

  const finalBounds = boundsOf(collectPoints(converted)) ?? {
    min: { x: 0, y: 0 },
    max: { x: 0, y: 0 },
  };

  return {
    sourceFormat: 'dxf',
    sourceName: options.sourceName,
    scale,
    layers: layers.sort((a, b) => b.entityCount - a.entityCount),
    entities: converted,
    bounds: finalBounds,
    warnings,
  };
}

/* ------------------------------------------------------------------ helpers */

/**
 * Reads a number out of a dimension's text override.
 *
 * `<>` is AutoCAD's placeholder meaning "print the measured value", so it
 * carries no independent information and must not be treated as a reading.
 * Prefixes and suffixes around the number (`~`, `מ׳`, `±`) are ignored.
 */
export function parseDimensionText(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.includes('<>')) return undefined;
  const match = trimmed.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return undefined;
  const value = Number.parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function collectPoints(entities: readonly PlanEntity[]): Vec2[] {
  const points: Vec2[] = [];
  for (const e of entities) {
    switch (e.kind) {
      case 'polyline':
        points.push(...e.vertices);
        break;
      case 'circle':
      case 'arc':
        points.push(
          { x: e.center.x - e.radius, y: e.center.y - e.radius },
          { x: e.center.x + e.radius, y: e.center.y + e.radius },
        );
        break;
      case 'point':
        points.push(e.position);
        break;
      case 'text':
        points.push(e.position);
        break;
      case 'block':
        points.push(e.position);
        break;
      case 'hatch':
        for (const loop of e.loops) points.push(...loop.vertices);
        break;
      case 'dimension':
        points.push(e.from, e.to);
        break;
    }
  }
  return points;
}

/** Multiplies every coordinate through by the resolved metres-per-unit factor. */
function scaleEntity(entity: PlanEntity, k: number): PlanEntity {
  const p = (v: Vec2): Vec2 => ({ x: v.x * k, y: v.y * k });
  switch (entity.kind) {
    case 'polyline':
      // Bulge is a ratio of sagitta to half-chord, so a uniform scale leaves it
      // unchanged — scaling it here would bend every arc.
      return { ...entity, vertices: entity.vertices.map(p), ...(entity.width ? { width: entity.width * k } : {}) };
    case 'circle':
      return { ...entity, center: p(entity.center), radius: entity.radius * k };
    case 'arc':
      // Angles are unaffected by a uniform scale.
      return { ...entity, center: p(entity.center), radius: entity.radius * k };
    case 'point':
      return { ...entity, position: p(entity.position) };
    case 'text':
      return { ...entity, position: p(entity.position), height: entity.height * k };
    case 'block':
      return { ...entity, position: p(entity.position) };
    case 'hatch':
      return { ...entity, loops: entity.loops.map((l) => ({ vertices: l.vertices.map(p) })) };
    case 'dimension':
      return {
        ...entity,
        from: p(entity.from),
        to: p(entity.to),
        ...(entity.displayedValue === undefined ? {} : { displayedValue: entity.displayedValue }),
      };
  }
}
