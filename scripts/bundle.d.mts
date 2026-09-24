/**
 * Types for `npm run bundle`, which is plain ESM so it runs without a build
 * step (PLAN.md M328). They exist so its tests call the code the script
 * runs.
 */
export const NOISE_KB: number;
export function decodeVlq(segment: string): number[];
export function decodeMappings(mappings: string): [number, number][][];
export function sourceName(file: string, root?: string): string;
export interface SourceMap {
  sources: string[];
  mappings: string;
  sourceRoot?: string;
}
export function attribute(
  code: string,
  map: SourceMap,
  name?: (raw: string) => string,
): { spans: Map<string, [number, number][]>; unclaimed: number };
export function without(code: string, cut: readonly [number, number][]): string;
export interface Row {
  name: string;
  bytes: number;
  gzip: number;
}
export function composition(
  code: string,
  map: SourceMap,
  name?: (raw: string) => string,
): { rows: Row[]; unclaimed: number; whole: number };
export function headline(load: { kb: number; js: number; css: number }): string;
export function changes(
  before: { rows: Row[] },
  after: { rows: Row[] },
): { name: string; status: 'new' | 'gone' | 'changed'; bytes: number; gzip: number }[];
export function namedFiles(code: string): string[];
export function chunkName(file: string): string;
export function chunkChanges(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] };
export function namesCost(code: string): number;
