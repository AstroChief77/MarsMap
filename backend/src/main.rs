use backend::find_rover_path;

fn main() {
    let map_data = vec![
        vec![ 0,  1,  1,  2,  2,  3,  3,  4,  4,  5,  5,  4,  3,  2,  1,  0,  0,  1,  2,  3],
        vec![ 1,  1,  2,  2, -999, -999,  3,  4,  5,  6,  5,  4,  3,  2,  1,  1,  2,  3,  4,  4],
        vec![ 1,  2,  2,  3, -999, -999,  4,  5,  6,  7,  6,  5,  4,  3,  2,  2,  3,  4,  5,  5],
        vec![ 2,  2,  3,  4,  4,  4,  5,  6,  7,  8,  7,  6,  5,  4,  3,  3,  4,  5,  6,  6],
        vec![ 2,  3,  4,  5,  5,  5,  6,  7,  8,  9,  8,  7,  6,  5,  4,  4,  5,  6,  7,  7],
        vec![ 3,  3,  4,  5, -999, -999, -999,  8,  9, 10,  9,  8,  7,  6,  5,  5,  6,  7,  8,  8],
        vec![ 3,  4,  5,  6, -999, 12, -999,  9, 10, 11, 10,  9,  8,  7,  6,  6,  7,  8,  9,  9],
        vec![ 4,  4,  5,  6, -999, -999, -999, 10, 11, 12, 11, 10,  9,  8,  7,  7,  8,  9, 10, 10],
        vec![ 4,  5,  6,  7,  7,  8,  9, 10, 11, 12, 11, 10,  9,  8,  7,  7,  8,  9, 10, 10],
        vec![ 5,  5,  6,  7,  8,  9, 10, 11, -999, -999, -999, 10,  9,  8,  7,  6,  7,  8,  9,  9],
        vec![ 5,  6,  7,  8,  9, 10, 11, 12, -999, 15, -999, 11, 10,  9,  8,  7,  6,  7,  8,  8],
        vec![ 4,  5,  6,  7,  8,  9, 10, 11, -999, -999, -999, 10,  9,  8,  7,  6,  5,  6,  7,  7],
        vec![ 4,  4,  5,  6,  7,  8,  9, 10, 10,  9,  8,  8,  7,  6,  5,  4,  4,  5,  6,  6],
        vec![ 3,  3,  4,  5,  6,  7,  8,  8,  7,  6,  5,  5,  4,  3,  3,  3,  4,  4,  5,  5],
        vec![ 2,  3,  3,  4,  5,  6, -999, -999, -999, -999,  4,  4,  3,  2,  2,  3,  3,  4,  4,  4],
        vec![ 2,  2,  3,  4,  4,  5, -999,  1,  1, -999,  3,  3,  2,  2,  1,  2,  3,  3,  3,  3],
        vec![ 1,  2,  2,  3,  3,  4, -999, -999, -999, -999,  2,  2,  1,  1,  1,  2,  2,  2,  2,  2],
        vec![ 1,  1,  2,  2,  3,  3,  3,  2,  2,  1,  1,  1,  1,  0,  1,  1,  1,  2,  2,  1],
        vec![ 0,  1,  1,  2,  2,  2,  2,  1,  1,  1,  0,  0,  0,  0,  1,  1,  1,  1,  1,  1],
        vec![ 0,  0,  1,  1,  1,  1,  1,  1,  0,  0,  0,  0,  0,  1,  1,  1,  1,  1,  1,  0],
    ];

    let width = 20;
    let height = 20;
    let flat_grid: Vec<i32> = map_data.into_iter().flatten().collect();

    let start_x = 0;
    let start_y = 0;
    let goal_x = 19;
    let goal_y = 19;

    println!("==================================================");
    println!("🪐 AstroChief Rust A* Path Finder (Direct Call)");
    println!("Harita Boyutu: {}x{}", width, height);
    println!("Baslangic: ({}, {})", start_x, start_y);
    println!("Hedef:     ({}, {})", goal_x, goal_y);
    println!("==================================================");

    let json_result = find_rover_path(&flat_grid, width, height, start_x, start_y, goal_x, goal_y, 420);
    println!("Rust Ciktisi (JSON):");
    println!("{}", json_result);

    if std::env::args().any(|a| a == "--serve") {
        let addr = std::env::var("MARS_BACKEND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".to_string());
        run_http_server(&addr, &json_result);
    }
}

fn run_http_server(addr: &str, sample_route_json: &str) {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let Ok(listener) = TcpListener::bind(addr) else {
        eprintln!("HTTP sunucusu baslatilamadi: {}", addr);
        return;
    };
    println!("🚀 AstroChief Rust HTTP API dinleniyor: http://{}", addr);

    for stream in listener.incoming().flatten() {
        let mut stream = stream;
        let mut buf = [0u8; 16384];
        let n = stream.read(&mut buf).unwrap_or(0);
        if n == 0 {
            continue;
        }
        let req = String::from_utf8_lossy(&buf[..n]);
        let first_line = req.lines().next().unwrap_or("");
        if first_line.starts_with("OPTIONS ") {
            let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(resp.as_bytes());
            continue;
        }
        let (status, body) = if first_line.contains("/api/v1/health") {
            ("200 OK", "{\"status\":\"ok\",\"engine\":\"rust-astar-v3.9\",\"version\":\"3.9.0\"}".to_string())
        } else if first_line.contains("/api/v1/hazards") {
            ("200 OK", "{\"acidZones\":[],\"stormZones\":[],\"radiationZones\":[]}".to_string())
        } else if first_line.contains("/api/v1/route") {
            ("200 OK", format!("{{\"scope\":\"global\",\"engine\":\"rust-http-astar\",\"rustRawOutput\":{}}}", sample_route_json))
        } else {
            ("404 Not Found", "{\"error\":\"not_found\"}".to_string())
        };
        let resp = format!(
            "HTTP/1.1 {}\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            status,
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes());
    }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-46: 20x20 ornek Mars topografya ve engel izgarasi uzerinde dogrudan find_rover_path A* testi.
   - Satir 47-93: --serve bayragi verildiginde 127.0.0.1:8080 uzerinde /api/v1/health, /api/v1/hazards ve /api/v1/route sunan hafif HTTP sunucusu.
   ========================================================================== */
