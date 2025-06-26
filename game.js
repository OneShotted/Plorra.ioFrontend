const canvas = document.getElementById("gameCanvas");
const minimap = document.getElementById("minimapCanvas");
const ctx = canvas.getContext("2d");
const miniCtx = minimap.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const CELL_SIZE = 20;
const GRID_WIDTH = 400;  // 8000 / 20
const GRID_HEIGHT = 400;
const MAP_WIDTH = CELL_SIZE * GRID_WIDTH;
const MAP_HEIGHT = CELL_SIZE * GRID_HEIGHT;

let socket, playerId = null, players = {}, playerName = "";
const keys = {};
let lastTime = performance.now();

document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

document.getElementById("startBtn").onclick = () => {
  playerName = document.getElementById("usernameInput").value.trim();
  if (!playerName) return;

  document.getElementById("loginScreen").style.display = "none";
  minimap.style.display = "block";

  socket = new WebSocket("wss://plorrabackend.onrender.com");
  socket.onopen = () => socket.send(JSON.stringify({ type: "join", name: playerName }));
  socket.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === "init") playerId = data.id;
    else if (data.type === "state") players = data.players;
  };

  gameLoop();
};

// Simplified garden biome map data as 2D grid: 0=walkable,1=wall
// This is a sampled/handcrafted grid inspired by the map you linked.
// For brevity, here is a small example pattern — in practice, you'd want to paste the full grid data.
// I’ll generate a pattern that has spiral shapes and large walls across the grid.

const mapGrid = new Array(GRID_HEIGHT).fill(0).map(() => new Array(GRID_WIDTH).fill(0));

// Simple function to create spiral walls in grid
function drawSpiralOnGrid(cx, cy, turns, spacing) {
  let angleStep = 0.1;
  for (let a = 0; a < Math.PI * 2 * turns; a += angleStep) {
    let r = spacing * a;
    let x = Math.floor(cx + Math.cos(a) * r);
    let y = Math.floor(cy + Math.sin(a) * r);

    if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
      mapGrid[y][x] = 1;
      // Make walls thicker:
      if (x + 1 < GRID_WIDTH) mapGrid[y][x + 1] = 1;
      if (y + 1 < GRID_HEIGHT) mapGrid[y + 1][x] = 1;
    }
  }
}

// Generate several spirals on the map (positions roughly from your image)
drawSpiralOnGrid(100, 100, 5, 2);
drawSpiralOnGrid(300, 300, 6, 2);
drawSpiralOnGrid(100, 300, 4, 1.8);
drawSpiralOnGrid(250, 150, 4.5, 1.6);
drawSpiralOnGrid(350, 80, 4, 1.5);

// Add some rectangular walls manually for maze-like structure
for (let i = 150; i < 260; i++) {
  mapGrid[200][i] = 1;
  mapGrid[201][i] = 1;
}
for (let j = 180; j < 220; j++) {
  mapGrid[j][180] = 1;
  mapGrid[j][181] = 1;
}

// Collision check function
function isWallAtPixel(x, y) {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return true;
  const gridX = Math.floor(x / CELL_SIZE);
  const gridY = Math.floor(y / CELL_SIZE);
  return mapGrid[gridY][gridX] === 1;
}

function canMoveTo(x, y) {
  // Check player circle with radius 20 px for collision
  const radius = 20;
  for (let dx = -radius; dx <= radius; dx += 10) {
    for (let dy = -radius; dy <= radius; dy += 10) {
      const checkX = x + dx;
      const checkY = y + dy;
      if (isWallAtPixel(checkX, checkY)) return false;
    }
  }
  return true;
}

function drawMap(camX, camY) {
  ctx.fillStyle = "#222";
  ctx.fillRect(-camX, -camY, MAP_WIDTH, MAP_HEIGHT);

  ctx.fillStyle = "#4a7a2f";
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (mapGrid[y][x] === 1) {
        ctx.fillRect(x * CELL_SIZE - camX, y * CELL_SIZE - camY, CELL_SIZE, CELL_SIZE);
      }
    }
  }
}

function drawMinimap(self) {
  const scaleX = minimap.width / MAP_WIDTH;
  const scaleY = minimap.height / MAP_HEIGHT;
  miniCtx.clearRect(0, 0, minimap.width, minimap.height);

  miniCtx.fillStyle = "#4a7a2f";
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (mapGrid[y][x] === 1) {
        miniCtx.fillRect(x * CELL_SIZE * scaleX, y * CELL_SIZE * scaleY, CELL_SIZE * scaleX, CELL_SIZE * scaleY);
      }
    }
  }

  for (const id in players) {
    const p = players[id];
    miniCtx.fillStyle = id === playerId ? "lime" : "gray";
    miniCtx.fillRect(p.x * scaleX - 4 / 2, p.y * scaleY - 4 / 2, 4, 4);
  }

  miniCtx.strokeStyle = "white";
  miniCtx.strokeRect(0, 0, minimap.width, minimap.height);
}

function drawPlayer(p, camX, camY) {
  const { x, y, name } = p;
  const r = 20;

  ctx.fillStyle = "yellow";
  ctx.beginPath();
  ctx.arc(x - camX, y - camY, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.arc(x - camX - 6, y - camY - 5, 3, 0, Math.PI * 2);
  ctx.arc(x - camX + 6, y - camY - 5, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x - camX, y - camY + 5, 8, 0, Math.PI);
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(name, x - camX, y - camY - 25);
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  if (!players[playerId]) return;
  const self = players[playerId];
  let dx = 0, dy = 0;
  const speed = 320; // pixels per second

  if (keys["w"]) dy -= speed * delta;
  if (keys["s"]) dy += speed * delta;
  if (keys["a"]) dx -= speed * delta;
  if (keys["d"]) dx += speed * delta;

  const newX = self.x + dx;
  const newY = self.y + dy;

  if (canMoveTo(newX, newY)) {
    self.x = Math.max(0, Math.min(MAP_WIDTH, newX));
    self.y = Math.max(0, Math.min(MAP_HEIGHT, newY));
  }

  socket.send(JSON.stringify({ type: "move", x: self.x, y: self.y }));

  const camX = self.x - canvas.width / 2;
  const camY = self.y - canvas.height / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap(camX, camY);

  for (const id in players) drawPlayer(players[id], camX, camY);
  drawMinimap(self);
}


