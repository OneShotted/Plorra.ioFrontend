const canvas = document.getElementById("gameCanvas");
const minimap = document.getElementById("minimapCanvas");
const ctx = canvas.getContext("2d");
const miniCtx = minimap.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const mapSize = 4000;
let socket, playerId = null, players = {}, playerName = "";

const keys = {};
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

const zones = []; // Wall clusters
generateZones();

// UI login
document.getElementById("startBtn").onclick = () => {
  playerName = document.getElementById("usernameInput").value.trim();
  if (!playerName) return;
  document.getElementById("loginScreen").style.display = "none";

  socket = new WebSocket("wss://plorrabackend.onrender.com");

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "join", name: playerName }));
  };

  socket.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === "init") playerId = data.id;
    else if (data.type === "state") players = data.players;
  };

  gameLoop();
};

function generateZones() {
  for (let i = 0; i < 20; i++) {
    const walls = [];
    const cx = Math.random() * mapSize;
    const cy = Math.random() * mapSize;

    for (let a = 0; a < 2 * Math.PI; a += 0.3) {
      const r = 30 + a * 25;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      walls.push({ x, y, w: 20, h: 20 });
    }

    zones.push(walls);
  }
}

function drawMap(ctx, camX, camY) {
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(-camX, -camY, mapSize, mapSize);

  for (const zone of zones) {
    for (const wall of zone) {
      ctx.fillStyle = "#5f5";
      ctx.fillRect(wall.x - camX, wall.y - camY, wall.w, wall.h);
    }
  }
}

function drawMinimap(self) {
  const scale = minimap.width / mapSize;
  miniCtx.clearRect(0, 0, minimap.width, minimap.height);

  for (const zone of zones) {
    for (const wall of zone) {
      miniCtx.fillStyle = "#5f5";
      miniCtx.fillRect(wall.x * scale, wall.y * scale, 3, 3);
    }
  }

  for (const id in players) {
    const p = players[id];
    miniCtx.fillStyle = id === playerId ? "lime" : "gray";
    miniCtx.fillRect(p.x * scale, p.y * scale, 4, 4);
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
  if (!players[playerId]) return;
  const self = players[playerId];

  const speed = 4;
  let dx = 0, dy = 0;
  if (keys["w"]) dy -= speed;
  if (keys["s"]) dy += speed;
  if (keys["a"]) dx -= speed;
  if (keys["d"]) dx += speed;

  // Move & collision
  let nextX = self.x + dx;
  let nextY = self.y + dy;

  const collided = zones.some(zone =>
    zone.some(w => (
      nextX > w.x - 20 &&
      nextX < w.x + w.w + 20 &&
      nextY > w.y - 20 &&
      nextY < w.y + w.h + 20
    ))
  );

  if (!collided) {
    self.x = Math.max(0, Math.min(mapSize, nextX));
    self.y = Math.max(0, Math.min(mapSize, nextY));
  }

  socket.send(JSON.stringify({ type: "move", x: self.x, y: self.y }));

  const camX = self.x - canvas.width / 2;
  const camY = self.y - canvas.height / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap(ctx, camX, camY);

  for (const id in players) drawPlayer(players[id], camX, camY);
  drawMinimap(self);
}

