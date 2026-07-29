/**
 * Hand-built DXF fixtures.
 *
 * Written as group-code pairs rather than exported from a CAD program so that
 * every test states exactly what is in the file. When a test says "a 5 × 4 m
 * room measures 20 m²", the 5000 × 4000 in millimetres is right here to read.
 */

type Pair = [number, string | number];

function serialise(pairs: Pair[]): string {
  return pairs.map(([code, value]) => `${code}\n${value}`).join('\n') + '\n';
}

export interface DxfFixtureOptions {
  /** `$INSUNITS` code. 4 = mm, 5 = cm, 6 = m. Omit to leave the header silent. */
  insunits?: number;
  layers?: { name: string; color?: number; frozen?: boolean }[];
  entities?: Pair[][];
}

export function buildDxf(options: DxfFixtureOptions): string {
  const pairs: Pair[] = [];

  pairs.push([0, 'SECTION'], [2, 'HEADER']);
  if (options.insunits !== undefined) {
    pairs.push([9, '$INSUNITS'], [70, options.insunits]);
  }
  pairs.push([0, 'ENDSEC']);

  pairs.push([0, 'SECTION'], [2, 'TABLES'], [0, 'TABLE'], [2, 'LAYER']);
  for (const layer of options.layers ?? []) {
    pairs.push([0, 'LAYER'], [2, layer.name], [70, layer.frozen ? 1 : 0], [62, layer.color ?? 7]);
  }
  pairs.push([0, 'ENDTAB'], [0, 'ENDSEC']);

  pairs.push([0, 'SECTION'], [2, 'BLOCKS'], [0, 'ENDSEC']);

  pairs.push([0, 'SECTION'], [2, 'ENTITIES']);
  for (const entity of options.entities ?? []) pairs.push(...entity);
  pairs.push([0, 'ENDSEC'], [0, 'EOF']);

  return serialise(pairs);
}

/** A closed LWPOLYLINE from a list of `[x, y]` pairs, in drawing units. */
export function lwpolyline(layer: string, points: [number, number][], closed = true, bulges?: number[]): Pair[] {
  const pairs: Pair[] = [
    [0, 'LWPOLYLINE'],
    [8, layer],
    [90, points.length],
    [70, closed ? 1 : 0],
  ];
  points.forEach(([x, y], i) => {
    pairs.push([10, x], [20, y]);
    const bulge = bulges?.[i];
    if (bulge) pairs.push([42, bulge]);
  });
  return pairs;
}

export function line(layer: string, from: [number, number], to: [number, number]): Pair[] {
  return [
    [0, 'LINE'],
    [8, layer],
    [10, from[0]],
    [20, from[1]],
    [11, to[0]],
    [21, to[1]],
  ];
}

export function circle(layer: string, center: [number, number], radius: number): Pair[] {
  return [
    [0, 'CIRCLE'],
    [8, layer],
    [10, center[0]],
    [20, center[1]],
    [40, radius],
  ];
}

export function text(layer: string, at: [number, number], value: string, height = 250): Pair[] {
  return [
    [0, 'TEXT'],
    [8, layer],
    [10, at[0]],
    [20, at[1]],
    [40, height],
    [1, value],
  ];
}

/** A linear DIMENSION with an optional typed text override. */
export function dimension(
  layer: string,
  from: [number, number],
  to: [number, number],
  override?: string,
): Pair[] {
  return [
    [0, 'DIMENSION'],
    [8, layer],
    [13, from[0]],
    [23, from[1]],
    [14, to[0]],
    [24, to[1]],
    [1, override ?? ''],
  ];
}

export function insert(
  layer: string,
  blockName: string,
  at: [number, number],
  extra: Pair[] = [],
): Pair[] {
  return [[0, 'INSERT'], [8, layer], [2, blockName], [10, at[0]], [20, at[1]], ...extra];
}
