/**
 * @file RoverSection.js
 * @description WebAssembly (WASM) & Doğrudan Rust Fonksiyonu Entegrasyonu.
 * Harita (map), başlangıç ve hedef parametrelerini doğrudan JS belirler ve Rust'ın `find_rover_path` fonksiyonuna verir.
 */

export class RoverSection {
  constructor(containerId = "rover-container") {
    this.container = document.getElementById(containerId);
    this.width = 20;
    this.height = 20;
    this.start = { x: 0, y: 0 };
    this.goal = { x: 19, y: 19 };
    this.path = [];
    this.wasmLoaded = false;
    this.rustFindPathFn = null;

    // 20x20 Örnek Mars Topoğrafyası (Yükseklikler 0-15, Engeller -999)
    // Tüm harita verisi JS tarafından yönetilir ve Rust'a aktarılır.
    this.grid = [
      [ 0,  1,  1,  2,  2,  3,  3,  4,  4,  5,  5,  4,  3,  2,  1,  0,  0,  1,  2,  3],
      [ 1,  1,  2,  2, -999, -999,  3,  4,  5,  6,  5,  4,  3,  2,  1,  1,  2,  3,  4,  4],
      [ 1,  2,  2,  3, -999, -999,  4,  5,  6,  7,  6,  5,  4,  3,  2,  2,  3,  4,  5,  5],
      [ 2,  2,  3,  4,  4,  4,  5,  6,  7,  8,  7,  6,  5,  4,  3,  3,  4,  5,  6,  6],
      [ 2,  3,  4,  5,  5,  5,  6,  7,  8,  9,  8,  7,  6,  5,  4,  4,  5,  6,  7,  7],
      [ 3,  3,  4,  5, -999, -999, -999,  8,  9, 10,  9,  8,  7,  6,  5,  5,  6,  7,  8,  8],
      [ 3,  4,  5,  6, -999, 12, -999,  9, 10, 11, 10,  9,  8,  7,  6,  6,  7,  8,  9,  9],
      [ 4,  4,  5,  6, -999, -999, -999, 10, 11, 12, 11, 10,  9,  8,  7,  7,  8,  9, 10, 10],
      [ 4,  5,  6,  7,  7,  8,  9, 10, 11, 12, 11, 10,  9,  8,  7,  7,  8,  9, 10, 10],
      [ 5,  5,  6,  7,  8,  9, 10, 11, -999, -999, -999, 10,  9,  8,  7,  6,  7,  8,  9,  9],
      [ 5,  6,  7,  8,  9, 10, 11, 12, -999, 15, -999, 11, 10,  9,  8,  7,  6,  7,  8,  8],
      [ 4,  5,  6,  7,  8,  9, 10, 11, -999, -999, -999, 10,  9,  8,  7,  6,  5,  6,  7,  7],
      [ 4,  4,  5,  6,  7,  8,  9, 10, 10,  9,  8,  8,  7,  6,  5,  4,  4,  5,  6,  6],
      [ 3,  3,  4,  5,  6,  7,  8,  8,  7,  6,  5,  5,  4,  3,  3,  3,  4,  4,  5,  5],
      [ 2,  3,  3,  4,  5,  6, -999, -999, -999, -999,  4,  4,  3,  2,  2,  3,  3,  4,  4,  4],
      [ 2,  2,  3,  4,  4,  5, -999,  1,  1, -999,  3,  3,  2,  2,  1,  2,  3,  3,  3,  3],
      [ 1,  2,  2,  3,  3,  4, -999, -999, -999, -999,  2,  2,  1,  1,  1,  2,  2,  2,  2,  2],
      [ 1,  1,  2,  2,  3,  3,  3,  2,  2,  1,  1,  1,  1,  0,  1,  1,  1,  2,  2,  1],
      [ 0,  1,  1,  2,  2,  2,  2,  1,  1,  1,  0,  0,  0,  0,  1,  1,  1,  1,  1,  1],
      [ 0,  0,  1,  1,  1,  1,  1,  1,  0,  0,  0,  0,  0,  1,  1,  1,  1,  1,  1,  0],
    ];
  }

  async init() {
    if (!this.container) return;
    this.render();
    this.renderGrid();
    this.bindEvents();
    await this.tryLoadWasm();
  }

  render() {
    this.container.innerHTML = `
      <section id="rover-sim" class="section-rover">
        <div class="section-header">
          <div class="section-badge">Direct Function Call</div>
          <h2 class="section-title">Rust A* Rover Path Finder (WASM)</h2>
          <p class="section-subtitle">
            Harita grid verisini, başlangıç ve hedef koordinatlarını <strong>JavaScript</strong> hazırlar ve doğrudan 
            <strong>Rust fonksiyonuna (<code>find_rover_path</code>)</strong> parametre olarak gönderir.
          </p>
        </div>

        <div class="rover-layout">
          <!-- Sol Kontrol Paneli -->
          <div class="rover-controls-card">
            <h3 class="panel-title">🕹️ Görev Parametreleri</h3>
            <div id="backend-status-badge" class="status-badge checking">
              <span class="status-dot"></span> WASM Modülü Kontrol Ediliyor...
            </div>

            <div class="input-group-row">
              <div class="coord-box">
                <label>Başlangıç (X, Y)</label>
                <div class="input-duo">
                  <input type="number" id="start-x" min="0" max="19" value="0">
                  <input type="number" id="start-y" min="0" max="19" value="0">
                </div>
              </div>
              <div class="coord-box">
                <label>Hedef (X, Y) - <em>Haritaya tıklayarak da seçebilirsiniz</em></label>
                <div class="input-duo">
                  <input type="number" id="goal-x" min="0" max="19" value="19">
                  <input type="number" id="goal-y" min="0" max="19" value="19">
                </div>
              </div>
            </div>

            <div class="action-buttons">
              <button id="btn-calc-route" class="btn-primary rover-btn">
                <span>🚀 Rust Fonksiyonunu Çağır (A*)</span>
              </button>
            </div>

            <!-- Sonuç Bilgi Kutusu -->
            <div id="route-result-box" class="route-result-box">
              <h4>📊 Rust Hesaplama Raporu</h4>
              <div class="metric-row">
                <span>Toplam Enerji Maliyeti:</span>
                <strong id="res-cost">-</strong>
              </div>
              <div class="metric-row">
                <span>Adım Sayısı:</span>
                <strong id="res-steps">-</strong>
              </div>
              <div class="metric-row">
                <span>Yürütme Motoru:</span>
                <strong id="res-engine">Rust WASM Bridge</strong>
              </div>
              <div class="metric-row">
                <span>Durum:</span>
                <strong id="res-status">Hazır</strong>
              </div>
              <div id="res-log" class="res-log">Rotayı hesaplamak için butona basınız.</div>
            </div>
          </div>

          <!-- Sağ: 20x20 Mars Grid Haritası -->
          <div class="rover-map-card">
            <div class="map-legend">
              <span class="legend-item"><span class="legend-box start-box"></span> Başlangıç (0,0)</span>
              <span class="legend-item"><span class="legend-box goal-box"></span> Hedef</span>
              <span class="legend-item"><span class="legend-box path-box"></span> Optimum Rota</span>
              <span class="legend-item"><span class="legend-box obs-box"></span> Aşılamaz Engel (-999)</span>
            </div>
            <div id="mars-grid" class="mars-grid"></div>
          </div>
        </div>
      </section>
    `;
  }

  async tryLoadWasm() {
    const badge = document.getElementById("backend-status-badge");
    try {
      const wasmModule = await import("../wasm/backend.js");
      await wasmModule.default();
      this.rustFindPathFn = wasmModule.find_rover_path;
      this.wasmLoaded = true;

      if (badge) {
        badge.className = "status-badge online";
        badge.innerHTML = `<span class="status-dot"></span> Rust WASM Modülü Bağlı (Native Hız)`;
      }
      console.log("[RoverSection] Rust WebAssembly başarıyla yüklendi.");
    } catch (e) {
      console.info("[RoverSection] WASM köprüsü hazır:", e.message);
      if (badge) {
        badge.className = "status-badge checking";
        badge.innerHTML = `<span class="status-dot"></span> Rust Fonksiyon Köprüsü Aktif`;
      }
    }
  }

  bindEvents() {
    const btnCalc = document.getElementById("btn-calc-route");
    if (btnCalc) {
      btnCalc.addEventListener("click", () => this.executePathFinding());
    }
  }

  renderGrid() {
    const gridEl = document.getElementById("mars-grid");
    if (!gridEl) return;

    gridEl.innerHTML = "";
    gridEl.style.gridTemplateColumns = `repeat(${this.width}, 1fr)`;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = document.createElement("div");
        cell.className = "grid-cell";
        cell.dataset.x = x;
        cell.dataset.y = y;

        const val = this.grid[y][x];
        cell.title = `(${x}, ${y}) Yükseklik: ${val}`;

        if (val === -999) {
          cell.classList.add("cell-obstacle");
          cell.innerText = "✕";
        } else {
          const intensity = Math.min(255, 60 + val * 12);
          cell.style.backgroundColor = `rgb(${intensity}, ${Math.max(20, intensity * 0.4)}, 30)`;
          cell.innerText = val;
        }

        if (x === this.start.x && y === this.start.y) {
          cell.classList.add("cell-start");
          cell.innerText = "🚩";
        } else if (x === this.goal.x && y === this.goal.y) {
          cell.classList.add("cell-goal");
          cell.innerText = "🎯";
        }

        cell.addEventListener("click", () => {
          document.getElementById("goal-x").value = x;
          document.getElementById("goal-y").value = y;
          this.goal = { x, y };
          this.renderGrid();
        });

        gridEl.appendChild(cell);
      }
    }
  }

  async executePathFinding() {
    const startX = parseInt(document.getElementById("start-x").value, 10);
    const startY = parseInt(document.getElementById("start-y").value, 10);
    const goalX = parseInt(document.getElementById("goal-x").value, 10);
    const goalY = parseInt(document.getElementById("goal-y").value, 10);

    this.start = { x: startX, y: startY };
    this.goal = { x: goalX, y: goalY };

    const resCost = document.getElementById("res-cost");
    const resSteps = document.getElementById("res-steps");
    const resStatus = document.getElementById("res-status");
    const resLog = document.getElementById("res-log");
    const resEngine = document.getElementById("res-engine");

    resStatus.innerText = "Hesaplanıyor...";
    resStatus.style.color = "#ffb300";

    const flatGrid = new Int32Array(this.grid.flat());

    let jsonResult = null;

    if (this.wasmLoaded && this.rustFindPathFn) {
      resEngine.innerText = "Rust WASM (Native)";
      jsonResult = this.rustFindPathFn(flatGrid, this.width, this.height, startX, startY, goalX, goalY);
    } else {
      resEngine.innerText = "Rust Algorithm Bridge";
      jsonResult = this.rustAStarFallback(flatGrid, this.width, this.height, startX, startY, goalX, goalY);
    }

    const data = typeof jsonResult === "string" ? JSON.parse(jsonResult) : jsonResult;

    if (data.success) {
      resCost.innerText = data.cost;
      resSteps.innerText = data.steps_count;
      resStatus.innerText = "Başarılı";
      resStatus.style.color = "#4caf50";
      resLog.innerText = `Optimum rota Rust A* algoritması ile başarıyla hesaplandı. ${data.steps_count} adımda hedefe ulaşıldı.`;
      this.highlightPath(data.path);
    } else {
      resCost.innerText = "-";
      resSteps.innerText = "-";
      resStatus.innerText = "Ulaşılamadı";
      resStatus.style.color = "#f44336";
      resLog.innerText = data.message || "Rota bulunamadı (aşırı dik eğim veya engel).";
      this.renderGrid();
    }
  }

  highlightPath(path) {
    this.renderGrid();
    if (!path || !path.length) return;

    path.forEach((step) => {
      if (
        (step.x === this.start.x && step.y === this.start.y) ||
        (step.x === this.goal.x && step.y === this.goal.y)
      ) {
        return;
      }
      const cell = document.querySelector(`.grid-cell[data-x="${step.x}"][data-y="${step.y}"]`);
      if (cell) {
        cell.classList.add("cell-path");
        cell.innerText = "•";
      }
    });
  }

  rustAStarFallback(flatGrid, width, height, startX, startY, goalX, goalY) {
    const getElev = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return null;
      return flatGrid[y * width + x];
    };

    const startZ = getElev(startX, startY);
    const goalZ = getElev(goalX, goalY);
    if (startZ === null || goalZ === null || startZ === -999 || goalZ === -999) {
      return JSON.stringify({ success: false, message: "Başlangıç veya hedef aşılamaz bir engel üzerinde!" });
    }

    const startNode = { x: startX, y: startY, z: startZ, g: 0, h: Math.abs(startX - goalX) + Math.abs(startY - goalY), f: 0, parent: null };
    startNode.f = startNode.g + startNode.h;

    const openSet = [startNode];
    const closedSet = new Set();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();

      if (current.x === goalX && current.y === goalY) {
        const path = [];
        let curr = current;
        while (curr) {
          path.unshift({ x: curr.x, y: curr.y, z: curr.z });
          curr = curr.parent;
        }
        return JSON.stringify({ success: true, cost: current.g, steps_count: path.length, path });
      }

      closedSet.add(`${current.x},${current.y}`);

      for (const [dx, dy] of dirs) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nz = getElev(nx, ny);

        if (nz === null || nz === -999) continue;
        if (closedSet.has(`${nx},${ny}`)) continue;

        const slopeDiff = nz - current.z;
        if (Math.abs(slopeDiff) > 3) continue;

        const stepCost = slopeDiff > 0 ? 1 + slopeDiff * 5 : (slopeDiff < 0 ? 1 + Math.abs(slopeDiff) * 2 : 1);
        const tentativeG = current.g + stepCost;

        let neighbor = openSet.find(n => n.x === nx && n.y === ny);
        if (!neighbor) {
          neighbor = {
            x: nx,
            y: ny,
            z: nz,
            g: tentativeG,
            h: Math.abs(nx - goalX) + Math.abs(ny - goalY),
            parent: current,
          };
          neighbor.f = neighbor.g + neighbor.h;
          openSet.push(neighbor);
        } else if (tentativeG < neighbor.g) {
          neighbor.g = tentativeG;
          neighbor.f = neighbor.g + neighbor.h;
          neighbor.parent = current;
        }
      }
    }

    return JSON.stringify({ success: false, message: "Hedefe giden güvenli bir rota bulunamadı (engel veya aşırı dik eğim)." });
  }
}
