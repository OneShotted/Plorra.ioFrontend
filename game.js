const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const inventoryEl = document.getElementById("inventory");
const hotbarEl = document.getElementById("hotbar");
const combineBtn = document.getElementById("combineBtn");
const playerNameInput = document.getElementById("playerName");
const setNameBtn = document.getElementById("setNameBtn");
const infoEl = document.getElementById("info");
const chatContainer = document.getElementById("chatContainer");
const chatToggleBtn = document.getElementById("chatToggleBtn");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");

const WS_URL = "wss://plorrabackend.onrender.com"; 
const socket = new WebSocket(WS_URL);

let playerId = null;
let players = {};
let enemies = {};
let keys = {};
let localInput = { vx: 0, vy: 0, retract: false };
let lastTimestamp = 0;

let selectedInventory = new Set();
let selectedHotbar = null;

let mousePos = { x: 0, y: 0 };

// Game Constants
const MAP_SIZE = 3000;
const SAFE_ZONE_RADIUS = 200;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Keyboard input
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "ArrowUp" || e.key === "w") keys.up = true;
  if (e.key === "ArrowDown" || e.key === "s") keys.down = true;
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = true;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = true;
  if (e.key === "r") localInput.retract = true;
});

window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowUp" || e.key === "w") keys.up = false;
  if (e.key === "ArrowDown" || e.key === "s") keys.down = false;
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
  if (e.key === "r") localInput.retract = false;
});

// Mouse for drag & drop inventory
let dragData = null;

function renderPetalUI(container, petals, selectedSet, isHotbar = false) {
  container.innerHTML = "";
  petals.forEach((petal, idx) => {
    const div = document.createElement("div");
    div.className = `petal tier-${petal.tier} ${petal.type} ${petal.broken ? "broken" : ""}`;
    div.title = `${petal.type.toUpperCase()} TIER ${petal.tier}`;
    if (isHotbar && selectedHotbar === idx) div.classList.add("selected");
    if (!isHotbar && selectedSet.has(idx)) div.classList.add("selected");

    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (isHotbar) {
        selectedHotbar = idx === selectedHotbar ? null : idx;
        renderUI();
      } else {
        if (selectedSet.has(idx)) selectedSet.delete(idx);
        else selectedSet.add(idx);
        renderUI();
      }
      dragData = { source: isHotbar ? "hotbar" : "inventory", index: idx, petal };
    });

    div.addEventListener("mouseup", (e) => {
      if (dragData && dragData.source !== (isHotbar ? "hotbar" : "inventory")) {
        // Move petal between inventory and hotbar on drop
        if (dragData.source === "inventory" && isHotbar) {
          movePetalBetweenInventoryAndHotbar(dragData.index, idx, "inventoryToHotbar");
        } else if (dragData.source === "hotbar" && !isHotbar) {
          movePetalBetweenInventoryAndHotbar(dragData.index, idx, "hotbarToInventory");
        }
        dragData = null;
      }
    });

    container.appendChild(div);
  });
}

function movePetalBetweenInventoryAndHotbar(invIndex, hotIndex, action) {
  if (!players[playerId]) return;
  const player = players[playerId];
  const inventory = player.inventory;
  const hotbar = player.petals;

  if (action === "inventoryToHotbar") {
    if (hotIndex >= hotbar.length) return;
    // Swap or replace
    if (inventory[invIndex]) {
      const temp = hotbar[hotIndex];
      hotbar[hotIndex] = inventory[invIndex];
      inventory[invIndex] = temp;
    }
  } else if (action === "hotbarToInventory") {
    if (invIndex >= inventory.length) return;
    if (hotbar[hotIndex]) {
      const temp = inventory[invIndex];
      inventory[invIndex] = hotbar[hotIndex];
      hotbar[hotIndex] = temp;
    }
  }
  sendInventoryUpdate(player);
  renderUI();
}

function sendInventoryUpdate(player) {
  socket.send(
    JSON.stringify({
      type: "input",
      vx: localInput.vx,
      vy: localInput.vy,
      retract: localInput.retract,
      action: "updatePetals",
      payload: {
        inventory: player.inventory,
        petals: player.petals,
      },
    })
  );
}

// Combine button handler
combineBtn.onclick = () => {
  if (selectedInventory.size !== 3) return alert("Select exactly 3 petals to combine.");
  const indices = [...selectedInventory];
  socket.send(
    JSON.stringify({
      type: "input",
      action: "combinePetals",
      payload: { indices },
      vx: localInput.vx,
      vy: localInput.vy,
      retract: localInput.retract,
    })
  );
  selectedInventory.clear();
  renderUI();
};

setNameBtn.onclick = () => {
  const name = playerNameInput.value.trim();
  if (name.length === 0) return alert("Name cannot be empty");
  socket.send(JSON.stringify({ type: "setName", name }));
};

chatToggleBtn.onclick = () => {
  chatContainer.classList.toggle("hidden");
  chatInput.focus();
};

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && chatInput.value.trim() !== "") {
    socket.send(
      JSON.stringify({
        type: "chat",
        message: chatInput.value.trim(),
      })
    );
    chatInput.value = "";
  }
});

socket.onopen = () => {
  infoEl.textContent = "Connected to server.";
};
socket.onerror = () => {
  infoEl.textContent = "Connection error.";
};
socket.onclose = () => {
  infoEl.textContent = "Disconnected from server.";
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "welcome") {
    playerId = data.id;
  } else if (data.type === "update") {
    players = {};
    enemies = {};
    data.players.forEach((p) => {
      players[p.id] = p;
    });
    data.enemies.forEach((e) => {
      enemies[e.id] = e;
    });
    renderUI();
  } else if (data.type === "chat") {
    addChatMessage(data.from, data.message);
  } else if (data.type === "respawn") {
    alert("You died! Respawning...");
  }
};

function addChatMessage(sender, message) {
  const div = document.createElement("div");
  div.textContent = `${sender}: ${message}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Main game loop

function updateInput() {
  let vx = 0,
    vy = 0;
  if (keys.up) vy -= 1;
  if (keys.down) vy += 1;
  if (keys.left) vx -= 1;
  if (keys.right) vx += 1;
  const len = Math.hypot(vx, vy);
  if (len > 0) {
    vx /= len;
    vy /= len;
  }
  localInput.vx = vx;
  localInput.vy = vy;

  socket.send(
    JSON.stringify({
      type: "input",
      vx: localInput.vx,
      vy: localInput.vy,
      retract: localInput.retract,
    })
  );
}

function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  updateInput();

  drawGame();

  requestAnimationFrame(gameLoop);
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!players[playerId]) return;

  const player = players[playerId];

  // Translate so player is centered
  ctx.save();
  ctx.translate(canvas.width / 2 - player.x, canvas.height / 2 - player.y);

  // Draw safe zone
  ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, SAFE_ZONE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Draw players
  Object.values(players).forEach((p) => {
    if (p.dead) return;

    // Draw core
    ctx.fillStyle = p.id === playerId ? "#fff" : "#888";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.fill();

    // Health bar
    ctx.fillStyle = "red";
    ctx.fillRect(p.x - 20, p.y - 30, 40, 6);
    ctx.fillStyle = "lime";
    ctx.fillRect(p.x - 20, p.y - 30, (p.hp / p.maxHp) * 40, 6);

    // Draw petals orbiting core
    const petalCount = p.petals.length;
    const time = performance.now() / 1000;
    p.petals.forEach((petal, i) => {
      let angle = time * 2 * p.orbitSpeed + (i * (2 * Math.PI)) / petalCount;
      if (p.retracting) angle += Math.PI; // retract petals behind player

      const orbitRadius = p.orbitRadius;

      const px = p.x + orbitRadius * Math.cos(angle);
      const py = p.y + orbitRadius * Math.sin(angle);

      ctx.fillStyle = petalColor(petal.type);
      if (petal.broken) ctx.globalAlpha = 0.3;

      ctx.beginPath();
      ctx.arc(px, py, 10 + (petal.tier - 1) * 4, 0, Math.PI * 2);
      ctx.fill();

      if (petal.broken) ctx.globalAlpha = 1;
    });

    // Draw player name
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(p.name || "Anonymous", p.x, p.y + 40);
  });

  // Draw enemies
  Object.values(enemies).forEach((e) => {
    if (e.dead) return;
    ctx.fillStyle = enemyColor(e.type);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
    ctx.fill();

    // Enemy HP bar
    ctx.fillStyle = "red";
    ctx.fillRect(e.x - e.size, e.y - e.size - 10, e.size * 2, 6);
    ctx.fillStyle = "lime";
    ctx.fillRect(e.x - e.size, e.y - e.size - 10, (e.hp / e.maxHp) * e.size * 2, 6);
  });

  ctx.restore();
}

function petalColor(type) {
  switch (type) {
    case "basic":
      return "#fff";
    case "rock":
      return "#888";
    case "fire":
      return "#f55";
    case "ice":
      return "#5af";
    case "poison":
      return "#5f5";
    case "electric":
      return "#ffea00";
    case "shield":
      return "#a5a";
    default:
      return "#aaa";
  }
}

function enemyColor(type) {
  switch (type) {
    case "wanderer":
      return "#ff0";
    case "chaser":
      return "#f90";
    case "spinner":
      return "#f0f";
    case "miniboss":
      return "#f00";
    default:
      return "#999";
  }
}

function renderUI() {
  if (!players[playerId]) return;
  const player = players[playerId];

  renderPetalUI(inventoryEl, player.inventory || [], selectedInventory, false);
  renderPetalUI(hotbarEl, player.petals || [], selectedHotbar !== null ? new Set([selectedHotbar]) : new Set(), true);

  combineBtn.disabled = selectedInventory.size !== 3;

  infoEl.textContent = `HP: ${player.hp}/${player.maxHp} | Level: ${player.level} | XP: ${player.xp} | Coins: ${player.coins} | Petals: ${player.petals.length}/${player.petalSlots} | Inventory: ${player.inventory.length}`;
}

// Start game loop
requestAnimationFrame(gameLoop);
