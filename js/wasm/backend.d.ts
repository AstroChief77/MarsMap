/* tslint:disable */
/* eslint-disable */

/**
 * Find the optimal path using A* algorithm (with default 24.0 L water reserve).
 */
export function find_rover_path(grid_flat: Int32Array | number[], width: number, height: number, start_x: number, start_y: number, goal_x: number, goal_y: number, begin_oxy: number): string;

/**
 * Find the optimal path with explicit initial oxygen and water reserves.
 */
export function find_rover_path_with_water(grid_flat: Int32Array | number[], width: number, height: number, start_x: number, start_y: number, goal_x: number, goal_y: number, begin_oxy: number, begin_water: number): string;

/**
 * WASM/HTTP giris noktasi: maliyet + rakim izgarasindan donus noktalari (JSON) uretir.
 */
export function plan_cost_path(cost_flat: Float32Array | number[], elev_flat: Float32Array | number[], width: number, height: number, cell_km: number, start_x: number, start_y: number, goal_x: number, goal_y: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly find_rover_path: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly find_rover_path_with_water: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly plan_cost_path: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-25: find_rover_path, find_rover_path_with_water ve plan_cost_path TypeScript imzalari.
   - Satir 26-45: InitInput / InitOutput ve WASM bellek arayuzleri.
   - Satir 46-62: initSync ve __wbg_init WebAssembly baslatma imzalari.
   ========================================================================== */
