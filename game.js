const canvas = document.getElementById("gameCanvas");
const minimap = document.getElementById("minimapCanvas");
const ctx = canvas.getContext("2d");
const minimapCtx = minimap.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let socket;
let playerId = null;
let players = {};
let playerName = "";
const mapSize = 4000;

const keys = {};
document.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

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
    if (data.type === "init") {
      playerId = data.id;
    } else if (data.type === "state") {
      players = data.players;
    }
  };

  gameLoop();
};

function drawMap(ctx, camX, camY) {
  ctx.fillStyle = "#444";
  ctx.fillRect(-camX, -camY, mapSize, mapSize);

  ctx.strokeStyle = "#666";
  for (let x = 0; x < mapSize; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x - camX, -camY);
    ctx.lineTo(x - camX, mapSize - camY);
    ctx.stroke();
  }
  for (let y = 0; y < mapSize; y += 100) {
    ctx.beginPath();
    ctx.moveTo(-camX, y - camY);
    ctx.lineTo(mapSize - camX, y - camY);
    ctx.stroke();
  }
}

function drawPlayer(p, camX, camY) {
  const { x, y, name } = p;
  const radius = 20;

  ctx.fillStyle = "yellow";
  ctx.beginPath();
  ctx.arc(x - camX, y - camY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.arc(x - camX - 6, y - camY - 5, 3, 0, Math.PI * 2);
  ctx.arc(x - camX + 6, y - camY - 5, 3, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.beginPath();
  ctx.arc(x - camX, y - camY + 5, 8, 0, Math.PI);
  ctx.stroke();

  // Name
  ctx.fillStyle = "white";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(name, x - camX, y - camY - 25);
}

function drawMinimap(self) {
  minimapCtx.clearRect(0, 0, minimap.width, minimap.height);
  const scale = minimap.width / mapSize;

  for (const id in players) {
    const p = players[id];
    minimapCtx.fillStyle = id === playerId ? "lime" : "gray";
    minimapCtx.fillRect(p.x * scale, p.y * scale, 4, 4);
  }

  // Border
  minimapCtx.strokeStyle = "white";
  minimapCtx.strokeRect(0, 0, minimap.width, minimap.height);
}

function gameLoop() {
  requestAnimationFrame(gameLoop);

  if (!players[playerId]) return;
  const self = players[playerId];

  if (keys["w"]) self.y -= 4;
  if (keys["s"]) self.y += 4;
  if (keys["a"]) self.x -= 4;
  if (keys["d"]) self.x += 4;

  self.x = Math.max(0, Math.min(mapSize, self.x));
  self.y = Math.max(0, Math.min(mapSize, self.y));

  socket.send(JSON.stringify({ type: "move", x: self.x, y: self.y }));

  const camX = self.x - canvas.width / 2;
  const camY = self.y - canvas.height / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap(ctx, camX, camY);

  for (const id in players) {
    drawPlayer(players[id], camX, camY);
  }

  drawMinimap(self);
}

