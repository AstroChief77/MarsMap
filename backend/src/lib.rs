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
        let directions = [(1, 0), (-1, 0), (0, 1), (0, -1)];

        for (dx, dy) in directions {
            let Some(new_x) = current.x.checked_add(dx) else { continue; };
            let Some(new_y) = current.y.checked_add(dy) else { continue; };

            let Some(new_z) = self.get_elevation(new_x, new_y) else {
                continue;
            };

            // Unnavigable obstacle.
            if new_z == -999 {
                continue;
            }

            // Check for map slope limit (saturating subtraction prevents i32 overflow).
            let slope_diff = new_z.saturating_sub(current.z);
            if slope_diff.saturating_abs() > MAX_SLOPE_LIMIT {
                continue;
            }

            let new_pos = Pos {
                x: new_x,
                y: new_y,
                z: new_z,
            };

            let total_cost = if slope_diff > 0 {
                BASE_COST.saturating_add((slope_diff.saturating_mul(POZITIVE_SLOP_COST)) as u32)
            } else if slope_diff < 0 {
                BASE_COST.saturating_add((slope_diff.saturating_abs().saturating_mul(NEGATIVE_SLOP_COST)) as u32)
            } else {
                BASE_COST
            };

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
            |p| p.x.abs_diff(goal.0).saturating_add(p.y.abs_diff(goal.1)),
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

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-8: A* algoritmasi, egim/maliyet sabitleri ve opsiyonel wasm_bindgen baglantisi.
   - Satir 9-21: Pos (3B izgaradaki x, y, z hucresi) ve MarsMap veri yapilari.
   - Satir 22-49: MarsMap::new ve MarsMap::from_flat; negatif/tasma korumali duz diziden 2B izgara olusturma.
   - Satir 51-106: get_elevation ve get_successors; -999 engel filtreleme, <=3 egim siniri ve saturating maliyet hesabi.
   - Satir 108-129: find_path; Manhattan sezgisel fonksiyonlu A* en kisa ve guvenli yol cozucu.
   - Satir 131-160: find_rover_path; Rust ve WebAssembly tarafindan cagrilabilen JSON ciktili ana API fonksiyonu.
   ========================================================================== */
