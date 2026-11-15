use pathfinding::prelude::astar;
const MAX_SLOPE_LIMIT: i32 = 3;
const POZITIVE_SLOP_COST: i32 = 5;
const NEGATIVE_SLOP_COST: i32 = 2;
const BASE_COST: u32 = 1;
const DISTANCE_PER_MT: u64 = 25;
#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Pos {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

pub struct MarsMap {
    pub width: i32,
    pub height: i32,
    pub grid: Vec<Vec<i32>>,
}

impl MarsMap {
    pub fn new(width: i32, height: i32, grid: Vec<Vec<i32>>) -> Self {
        Self { width, height, grid }
    }

    pub fn from_flat(width: i32, height: i32, flat_grid: &[i32]) -> Self {
        let Ok(w) = usize::try_from(width) else {
            return Self { width: 0, height: 0, grid: Vec::new() };
        };
        let Ok(h) = usize::try_from(height) else {
            return Self { width: 0, height: 0, grid: Vec::new() };
        };
        if w == 0 || h == 0 || w.checked_mul(h).is_none_or(|total| total > 1_000_000) {
            return Self { width: 0, height: 0, grid: Vec::new() };
        }

        let mut grid = Vec::with_capacity(h);
        for y in 0..h {
            let start = y.saturating_mul(w);
            let end = start.saturating_add(w);
            if end <= flat_grid.len() {
                grid.push(flat_grid[start..end].to_vec());
            } else {
                grid.push(vec![0; w]);
            }
        }
        Self { width, height, grid }
    }

    // Check goal is in map.
    pub fn get_elevation(&self, x: i32, y: i32) -> Option<i32> {
        if x < 0 || x >= self.width || y < 0 || y >= self.height {
            return None;
        }
        let uy = usize::try_from(y).ok()?;
        let ux = usize::try_from(x).ok()?;
        self.grid.get(uy)?.get(ux).copied()
    }

    pub fn get_successors(&self, current: &Pos) -> Vec<(Pos, u32)> {
        let mut neighbors = Vec::new();
        // 8 Yon: 4 Ortogonal (maliyet 10) + 4 Diyagonal (maliyet 14 ~ 10*sqrt(2))
        let directions = [
            ( 1,  0, 10u32),
            (-1,  0, 10u32),
            ( 0,  1, 10u32),
            ( 0, -1, 10u32),
            ( 1,  1, 14u32),
            (-1, -1, 14u32),
            ( 1, -1, 14u32),
            (-1,  1, 14u32),
        ];

        for (dx, dy, base_cost) in directions {
            let Some(new_x) = current.x.checked_add(dx) else { continue; };
            let Some(new_y) = current.y.checked_add(dy) else { continue; };

            let Some(new_z) = self.get_elevation(new_x, new_y) else {
                continue;
            };

            // Gecilemez engel
            if new_z == -999 {
                continue;
            }

            // Diyagonal adimda kose kesme (corner-cutting) kontrolu
            if dx != 0 && dy != 0 {
                if self.get_elevation(current.x + dx, current.y) == Some(-999)
                    || self.get_elevation(current.x, current.y + dy) == Some(-999)
                {
                    continue;
                }
            }

            // Harita egim limiti kontrolu
            let slope_diff = new_z.saturating_sub(current.z);
            if slope_diff.saturating_abs() > MAX_SLOPE_LIMIT {
                continue;
            }

            let new_pos = Pos {
                x: new_x,
                y: new_y,
                z: new_z,
            };

            let slope_cost = if slope_diff > 0 {
                (slope_diff.saturating_mul(POZITIVE_SLOP_COST * 10)) as u32
            } else if slope_diff < 0 {
                (slope_diff.saturating_abs().saturating_mul(NEGATIVE_SLOP_COST * 10)) as u32
            } else {
                0
            };

            let total_cost = base_cost.saturating_add(slope_cost);
            neighbors.push((new_pos, total_cost));
        }

        neighbors
    }

    pub fn find_path(&self, start: (i32, i32), goal: (i32, i32)) -> Option<(Vec<Pos>, u32)> {
        let start_z = self.get_elevation(start.0, start.1)?;
        let goal_z = self.get_elevation(goal.0, goal.1)?;

        if start_z == -999 || goal_z == -999 {
            return None;
        }

        let start_pos = Pos {
            x: start.0,
            y: start.1,
            z: start_z,
        };

        astar(
            &start_pos,
            |p| self.get_successors(p),
            |p| {
                let dx = p.x.abs_diff(goal.0);
                let dy = p.y.abs_diff(goal.1);
                let max_d = dx.max(dy);
                let min_d = dx.min(dy);
                // Octile sezgisel maliyeti: 10 * max(dx, dy) + 4 * min(dx, dy)
                (10 * max_d).saturating_add(4 * min_d) as u32
            },
            |p| p.x == goal.0 && p.y == goal.1
        )
    }
}

/// Find the optimal path using A* algorithm.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn find_rover_path(
    grid_flat: &[i32],
    width: i32,
    height: i32,
    start_x: i32,
    start_y: i32,
    goal_x: i32,
    goal_y: i32,
    begin_oxy: i32,
) -> String {
    let mars_map = MarsMap::from_flat(width, height, grid_flat);

    match mars_map.find_path((start_x, start_y), (goal_x, goal_y)) {
        Some((path, total_cost)) => {
            let hoxy = path.len().saturating_mul(DISTANCE_PER_MT as usize);
            let hoxy_i32 = i32::try_from(hoxy).unwrap_or(i32::MAX);
            let avaible_oxy = begin_oxy.saturating_sub(hoxy_i32);
            let steps_json: Vec<String> = path
                .iter()
                .map(|p| format!("{{\"x\":{},\"y\":{},\"z\":{}}}", p.x, p.y, p.z))
                .collect();

            format!(
                "{{\"success\":true,\"cost\":{},\"distance\":{},\"avaible_oxy\":{},\"steps_count\":{},\"path\":[{}]}}",
                total_cost,
                path.len(),
                avaible_oxy,
                path.len(),
                steps_json.join(",")
            )
        }
        None => "{\"success\":false,\"message\":\"Hedefe giden guvenli bir rota bulunamadi (engel veya asiri dik egim).\"}".to_string(),
    }
}


// ==========================================================================
// NASA tarzi maliyet haritasi planlayicisi (GESTALT goodness map + Field D* cizgi integrali)
// cost_flat[i] <= 0 veya NaN => LETHAL (gecilemez). Aksi halde c_i >= 1 hucre maliyeti.
// Kenar maliyeti = sum(L_k * c_k * g(theta_k)); g = 1 + W * (theta/theta_max)^2 (anizotropik egim).
// ==========================================================================
const CLIMB_MAX_GRADE: f64 = 0.364; // tan(20 deg)
const CLIMB_UP_WEIGHT: f64 = 4.0;
const CLIMB_DOWN_WEIGHT: f64 = 1.5;

pub struct CostMap<'a> {
    pub w: usize,
    pub h: usize,
    pub cell_km: f64,
    pub cost: &'a [f32],
    pub elev: &'a [f32],
}

impl CostMap<'_> {
    fn lethal(&self, i: usize, j: usize) -> bool {
        let c = self.cost[j * self.w + i];
        !(c > 0.0)
    }

    fn elev_at(&self, x: f64, y: f64) -> f64 {
        let i0 = (x.floor().max(0.0) as usize).min(self.w - 1);
        let j0 = (y.floor().max(0.0) as usize).min(self.h - 1);
        let i1 = (i0 + 1).min(self.w - 1);
        let j1 = (j0 + 1).min(self.h - 1);
        let fx = (x - i0 as f64).clamp(0.0, 1.0);
        let fy = (y - j0 as f64).clamp(0.0, 1.0);
        let e = |i: usize, j: usize| f64::from(self.elev[j * self.w + i]);
        let top = e(i0, j0) * (1.0 - fx) + e(i1, j0) * fx;
        let bot = e(i0, j1) * (1.0 - fx) + e(i1, j1) * fx;
        top * (1.0 - fy) + bot * fy
    }

    /// Field D* tarzi dogru parcasi maliyet integrali; lethal veya asiri egimde None.
    pub fn segment_cost(&self, x0: f64, y0: f64, x1: f64, y1: f64) -> Option<f64> {
        let len = ((x1 - x0).powi(2) + (y1 - y0).powi(2)).sqrt();
        if len == 0.0 {
            return Some(0.0);
        }
        let steps = (len / 0.5).ceil().max(1.0) as usize;
        let (mut px, mut py) = (x0, y0);
        let mut pe = self.elev_at(x0, y0);
        let mut total = 0.0;
        for s in 1..=steps {
            let t = s as f64 / steps as f64;
            let qx = x0 + (x1 - x0) * t;
            let qy = y0 + (y1 - y0) * t;
            let ci = ((px + qx) / 2.0).round();
            let cj = ((py + qy) / 2.0).round();
            if ci < 0.0 || cj < 0.0 || ci as usize >= self.w || cj as usize >= self.h {
                return None;
            }
            let (ci, cj) = (ci as usize, cj as usize);
            if self.lethal(ci, cj) {
                return None;
            }
            let len_km = ((qx - px).powi(2) + (qy - py).powi(2)).sqrt() * self.cell_km;
            let qe = self.elev_at(qx, qy);
            let grade = if len_km > 0.0 { (qe - pe) / (len_km * 1000.0) } else { 0.0 };
            let ratio = grade.abs() / CLIMB_MAX_GRADE;
            if ratio > 1.0 {
                return None;
            }
            let w = if grade > 0.0 { CLIMB_UP_WEIGHT } else { CLIMB_DOWN_WEIGHT };
            total += len_km * f64::from(self.cost[cj * self.w + ci]) * (1.0 + w * ratio * ratio);
            px = qx;
            py = qy;
            pe = qe;
        }
        Some(total)
    }

    /// 16 yonlu A* (sezgisel: kalan oklid mesafesi * c_min=1, kabul edilebilir)
    pub fn search(&self, start: (usize, usize), goal: (usize, usize)) -> Option<(Vec<(usize, usize, f64)>, f64)> {
        use std::cmp::Reverse;
        use std::collections::BinaryHeap;
        let n = self.w * self.h;
        let mut g = vec![f64::INFINITY; n];
        let mut parent = vec![usize::MAX; n];
        let mut closed = vec![false; n];
        let idx = |i: usize, j: usize| j * self.w + i;
        let hfn = |i: usize, j: usize| {
            ((goal.0 as f64 - i as f64).powi(2) + (goal.1 as f64 - j as f64).powi(2)).sqrt() * self.cell_km
        };
        const DIRS: [(i32, i32); 16] = [
            (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1),
            (2, 1), (2, -1), (-2, 1), (-2, -1), (1, 2), (1, -2), (-1, 2), (-1, -2),
        ];
        let s = idx(start.0, start.1);
        let gl = idx(goal.0, goal.1);
        g[s] = 0.0;
        let mut heap = BinaryHeap::new();
        // f64 -> siralanabilir anahtar (mm hassasiyetinde u64)
        let key = |f: f64| Reverse((f * 1000.0) as u64);
        heap.push((key(hfn(start.0, start.1)), s));
        while let Some((_, cur)) = heap.pop() {
            if closed[cur] {
                continue;
            }
            if cur == gl {
                break;
            }
            closed[cur] = true;
            let (ci, cj) = (cur % self.w, cur / self.w);
            for (di, dj) in DIRS {
                let ni = ci as i32 + di;
                let nj = cj as i32 + dj;
                if ni < 0 || nj < 0 || ni as usize >= self.w || nj as usize >= self.h {
                    continue;
                }
                let (ni, nj) = (ni as usize, nj as usize);
                let nk = idx(ni, nj);
                if closed[nk] || self.lethal(ni, nj) {
                    continue;
                }
                let Some(ec) = self.segment_cost(ci as f64, cj as f64, ni as f64, nj as f64) else {
                    continue;
                };
                let tg = g[cur] + ec;
                if tg < g[nk] {
                    g[nk] = tg;
                    parent[nk] = cur;
                    heap.push((key(tg + hfn(ni, nj)), nk));
                }
            }
        }
        if !g[gl].is_finite() {
            return None;
        }
        let mut cells = Vec::new();
        let mut c = gl;
        while c != usize::MAX {
            cells.push((c % self.w, c / self.w, g[c]));
            c = parent[c];
        }
        cells.reverse();
        Some((cells, g[gl]))
    }

    /// Maliyet-bilincli ip germe: duz cizgi maliyeti izgara yolunu %3'ten fazla asmiyorsa kestirme yap.
    pub fn pull_string(&self, cells: &[(usize, usize, f64)]) -> Vec<(usize, usize)> {
        if cells.len() <= 2 {
            return cells.iter().map(|c| (c.0, c.1)).collect();
        }
        let mut out = vec![(cells[0].0, cells[0].1)];
        let mut a = 0;
        while a < cells.len() - 1 {
            let mut best = a + 1;
            let mut fails = 0;
            for b in (a + 2)..cells.len() {
                let lc = self.segment_cost(cells[a].0 as f64, cells[a].1 as f64, cells[b].0 as f64, cells[b].1 as f64);
                match lc {
                    Some(v) if v <= (cells[b].2 - cells[a].2) * 1.03 + 1e-6 => {
                        best = b;
                        fails = 0;
                    }
                    _ => {
                        fails += 1;
                        if fails > 6 {
                            break;
                        }
                    }
                }
            }
            out.push((cells[best].0, cells[best].1));
            a = best;
        }
        out
    }
}

/// WASM/HTTP giris noktasi: maliyet + rakim izgarasindan donus noktalari (JSON) uretir.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
#[allow(clippy::too_many_arguments)]
pub fn plan_cost_path(
    cost_flat: &[f32],
    elev_flat: &[f32],
    width: i32,
    height: i32,
    cell_km: f64,
    start_x: i32,
    start_y: i32,
    goal_x: i32,
    goal_y: i32,
) -> String {
    let fail = |m: &str| format!("{{\"success\":false,\"message\":\"{}\"}}", m);
    let (Ok(w), Ok(h)) = (usize::try_from(width), usize::try_from(height)) else {
        return fail("gecersiz boyut");
    };
    if w == 0 || h == 0 || w.checked_mul(h).is_none_or(|t| t > 1_000_000 || t > cost_flat.len() || t > elev_flat.len()) {
        return fail("gecersiz izgara");
    }
    let in_b = |x: i32, y: i32| x >= 0 && y >= 0 && (x as usize) < w && (y as usize) < h;
    if !in_b(start_x, start_y) || !in_b(goal_x, goal_y) {
        return fail("baslangic/hedef izgara disinda");
    }
    let map = CostMap { w, h, cell_km, cost: cost_flat, elev: elev_flat };
    match map.search((start_x as usize, start_y as usize), (goal_x as usize, goal_y as usize)) {
        Some((cells, total)) => {
            let pulled = map.pull_string(&cells);
            let pts: Vec<String> = pulled.iter().map(|(x, y)| format!("{{\"x\":{},\"y\":{}}}", x, y)).collect();
            format!(
                "{{\"success\":true,\"cost\":{:.2},\"raw_cells\":{},\"turn_vertices\":{},\"path\":[{}]}}",
                total,
                cells.len(),
                pulled.len().saturating_sub(2),
                pts.join(",")
            )
        }
        None => fail("Tehlikeleri ihlal etmeyen bir rota bulunamadi"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_terrain_is_a_single_straight_segment() {
        let (w, h) = (40usize, 20usize);
        let cost = vec![1.0f32; w * h];
        let elev = vec![0.0f32; w * h];
        let out = plan_cost_path(&cost, &elev, w as i32, h as i32, 1.0, 0, 10, 39, 10);
        assert!(out.contains("\"turn_vertices\":0"), "{out}");
    }

    #[test]
    fn route_never_enters_lethal_disc() {
        let (w, h) = (60usize, 40usize);
        let mut cost = vec![1.0f32; w * h];
        let elev = vec![0.0f32; w * h];
        for j in 0..h {
            for i in 0..w {
                let d = ((i as f64 - 30.0).powi(2) + (j as f64 - 20.0).powi(2)).sqrt();
                if d < 10.0 {
                    cost[j * w + i] = -1.0;
                } else if d < 12.5 {
                    cost[j * w + i] = 1.0 + 7.0 * ((12.5 - d) / 2.5).powi(2) as f32;
                }
            }
        }
        let map = CostMap { w, h, cell_km: 1.0, cost: &cost, elev: &elev };
        let (cells, _) = map.search((2, 20), (57, 20)).expect("path");
        let pulled = map.pull_string(&cells);
        for win in pulled.windows(2) {
            let (a, b) = (win[0], win[1]);
            assert!(map.segment_cost(a.0 as f64, a.1 as f64, b.0 as f64, b.1 as f64).is_some());
        }
        assert!(pulled.len() < 12, "too many turns: {}", pulled.len());
    }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-8: A* algoritmasi, egim/maliyet sabitleri ve opsiyonel wasm_bindgen baglantisi.
   - Satir 9-21: Pos (3B izgaradaki x, y, z hucresi) ve MarsMap veri yapilari.
   - Satir 22-49: MarsMap::new ve MarsMap::from_flat; negatif/tasma korumali duz diziden 2B izgara olusturma.
   - Satir 51-106: get_elevation ve get_successors; -999 engel filtreleme, <=3 egim siniri ve saturating maliyet hesabi.
   - Satir 108-129: find_path; Manhattan sezgisel fonksiyonlu A* en kisa ve guvenli yol cozucu.
   - Satir 131-160: find_rover_path; Rust ve WebAssembly tarafindan cagrilabilen JSON ciktili ana API fonksiyonu.
   - Satir 162-385: CostMap + plan_cost_path; NASA GESTALT/Field D* tarzi maliyet haritasi A*, anizotropik egim ve ip germe (JS NasaTraversePlanner ile ayni matematik) + birim testler.
   ========================================================================== */
