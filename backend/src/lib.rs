use pathfinding::prelude::astar;

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
        let mut grid = Vec::with_capacity(height as usize);
        for y in 0..height {
            let start = (y * width) as usize;
            let end = start + (width as usize);
            if end <= flat_grid.len() {
                grid.push(flat_grid[start..end].to_vec());
            } else {
                grid.push(vec![0; width as usize]);
            }
        }
        Self { width, height, grid }
    }

    pub fn get_elevation(&self, x: i32, y: i32) -> Option<i32> {
        if x < 0 || x >= self.width || y < 0 || y >= self.height {
            return None;
        }
        Some(self.grid[y as usize][x as usize])
    }

    pub fn get_successors(&self, current: &Pos) -> Vec<(Pos, u32)> {
        let mut neighbors = Vec::new();
        let directions = [(1, 0), (-1, 0), (0, 1), (0, -1)];

        for (dx, dy) in directions {
            let new_x = current.x + dx;
            let new_y = current.y + dy;

            let Some(new_z) = self.get_elevation(new_x, new_y) else {
                continue;
            };

            // -999 aşılamaz engel (uçurum, derin krater veya koca kaya)
            if new_z == -999 {
                continue;
            }

            // Eğim kontrolü: Rover'ın devrilmesini önleyen maksimum tırmanma/iniş sınırı
            let slope_diff = new_z - current.z;
            if slope_diff.abs() > 3 {
                continue;
            }

            let new_pos = Pos {
                x: new_x,
                y: new_y,
                z: new_z,
            };

            let base_cost = 1;
            let total_cost = if slope_diff > 0 {
                base_cost + (slope_diff * 5) as u32
            } else if slope_diff < 0 {
                base_cost + (slope_diff.abs() * 2) as u32
            } else {
                base_cost
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
            |p| (p.x.abs_diff(goal.0) + p.y.abs_diff(goal.1)) as u32,
            |p| p.x == goal.0 && p.y == goal.1,
        )
    }
}

/// JS tarafından doğrudan çağrılan ana Rust hesaplama fonksiyonu.
/// Harita dizisini (tek boyutlu dizi veya 2D), boyutları, başlangıç ve hedefi JS verir.
/// Çıktı olarak JSON formatında yolu ve toplam maliyeti döner.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn find_rover_path(
    grid_flat: &[i32],
    width: i32,
    height: i32,
    start_x: i32,
    start_y: i32,
    goal_x: i32,
    goal_y: i32,
) -> String {
    let mars_map = MarsMap::from_flat(width, height, grid_flat);

    match mars_map.find_path((start_x, start_y), (goal_x, goal_y)) {
        Some((path, total_cost)) => {
            let steps_json: Vec<String> = path
                .iter()
                .map(|p| format!("{{\"x\":{},\"y\":{},\"z\":{}}}", p.x, p.y, p.z))
                .collect();

            format!(
                "{{\"success\":true,\"cost\":{},\"steps_count\":{},\"path\":[{}]}}",
                total_cost,
                path.len(),
                steps_json.join(",")
            )
        }
        None => "{\"success\":false,\"message\":\"Hedefe giden guvenli bir rota bulunamadi (engel veya asiri dik egim).\"}".to_string(),
    }
}
