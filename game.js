const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let socket;
let playerId = null;
let players = {};
let mobs = {};
let petalsOnGround = {};
let username = '';
let camera = { x: 0, y: 0 };

const HOTBAR_SIZE = 5;
const INVENTORY_SIZE = 10;
let hotbar = new Array(HOTBAR_SIZE).fill(null);
let inventory = new Array(INVENTORY_SIZE).fill(null);

let orbitAngleOffset = 0;

document.getElementById('start-button').onclick = () => {
  username = document.getElementById('username-input').value.trim();
  if (!username) return;

  document.getElementById('username-screen').style.display = 'none';
  socket = new WebSocket('wss://plorrabackend.onrender.com');

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'join', username }));
    initInventoryUI();
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'init') {
      playerId = data.id;
    } else if (data.type === 'state') {
      players = data.players || {};
      mobs = data.mobs || {};
      petalsOnGround = data.petalsOnGround || {};

      if (players[playerId]) {
        const srvHotbar = players[playerId].hotbar || [];
        hotbar = srvHotbar.map((petal) => petal || null);

        const srvInventory = players[playerId].inventory || [];
        inventory = srvInventory.map((petal) => petal || null);

        const me = players[playerId];
        camera.x = me.x - canvas.width / 2;
        camera.y = me.y - canvas.height / 2;
      }
    }
  };
};

const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function gameLoop() {
  if (!playerId || !players[playerId]) return requestAnimationFrame(gameLoop);
  const me = players[playerId];

  let dx = 0, dy = 0;
  if (keys['w']) dy -= 3;
  if (keys['s']) dy += 3;
  if (keys['a']) dx -= 3;
  if (keys['d']) dx += 3;

  if (dx !== 0 || dy !== 0) {
    socket.send(JSON.stringify({ type: 'moveIntent', dx, dy }));
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw petals on ground
  for (const pid in petalsOnGround) {
    const petal = petalsOnGround[pid];
    const screenX = petal.x - camera.x;
    const screenY = petal.y - camera.y;
    ctx.fillStyle = petal.color;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw mobs
  for (const mid in mobs) {
    const mob = mobs[mid];
    const screenX = mob.x - camera.x;
    const screenY = mob.y - camera.y;

    ctx.fillStyle = mob.color;
    ctx.beginPath();
    if (mob.shape === 'circle') {
      ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
    } else if (mob.shape === 'triangle') {
      ctx.moveTo(screenX, screenY - 20);
      ctx.lineTo(screenX - 17, screenY + 10);
      ctx.lineTo(screenX + 17, screenY + 10);
      ctx.closePath();
    }
    ctx.fill();

    ctx.fillStyle = 'red';
    ctx.fillRect(screenX - 20, screenY - 30, 40, 5);
    ctx.fillStyle = 'lime';
    ctx.fillRect(screenX - 20, screenY - 30, 40 * (mob.hp / mob.maxHp), 5);
  }

  // Draw players
  orbitAngleOffset += 0.02;

  for (const pid in players) {
    const p = players[pid];
    const screenX = p.x - camera.x;
    const screenY = p.y - camera.y;

    ctx.fillStyle = pid == playerId ? '#4df' : '#fff';
    ctx.beginPath();
    ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.username, screenX, screenY - 30);

    ctx.fillStyle = 'red';
    ctx.fillRect(screenX - 20, screenY + 25, 40, 5);
    ctx.fillStyle = 'lime';
    ctx.fillRect(screenX - 20, screenY + 25, 40 * (p.hp / p.maxHp), 5);

    // Orbiting petals only for self
    if (pid == playerId) {
      const radius = 40;
      const activePetals = hotbar.filter(Boolean);
      const step = (Math.PI * 2) / (activePetals.length || 1);

      activePetals.forEach((petal, i) => {
        const orbitAngle = orbitAngleOffset + i * step;
        const px = screenX + Math.cos(orbitAngle) * radius;
        const py = screenY + Math.sin(orbitAngle) * radius;

        ctx.fillStyle = petal.hp === 0 ? 'gray' : petal.color;
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // Petal pickup
  for (const pid in petalsOnGround) {
    const petal = petalsOnGround[pid];
    const dist = Math.hypot(me.x - petal.x, me.y - petal.y);
    if (dist < 30) {
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        if (!inventory[i]) {
          inventory[i] = {
            id: petal.id,
            type: petal.type,
            damage: petal.damage,
            hp: 100,
            color: petal.color,
            cooldown: 0
          };
          delete petalsOnGround[pid];
          sendInventoryUpdate();
          break;
        }
      }
    }
  }

  socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'attackTick' }));
  renderInventory();
  requestAnimationFrame(gameLoop);
}

function initInventoryUI() {
  const hotbarEl = document.getElementById('hotbar');
  const invEl = document.getElementById('inventory');
  hotbarEl.innerHTML = '';
  invEl.innerHTML = '';

  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const slot = document.createElement('div');
    setupSlot(slot, i, 'hotbar');
    hotbarEl.appendChild(slot);
  }
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const slot = document.createElement('div');
    setupSlot(slot, i, 'inventory');
    invEl.appendChild(slot);
  }
}

function setupSlot(slot, index, type) {
  slot.className = 'slot';
  slot.dataset.slot = index;
  slot.dataset.type = type;
  slot.ondrop = handleDrop;
  slot.ondragover = (e) => e.preventDefault();
}

function createPetalElement(petal) {
  const el = document.createElement('div');
  el.draggable = true;
  el.style.width = '30px';
  el.style.height = '30px';
  el.style.borderRadius = '50%';
  el.style.backgroundColor = petal.hp === 0 ? 'gray' : petal.color;
  el.style.border = '2px solid white';
  el.style.boxSizing = 'border-box';
  el.title = `${petal.type} (${petal.damage} dmg)`;
  el.dataset.id = petal.id;
  el.style.cursor = 'grab';
  el.ondragstart = (e) => {
    e.dataTransfer.setData('text/plain', petal.id);
  };
  return el;
}

function renderInventory() {
  const hotbarEls = document.getElementById('hotbar').children;
  const invEls = document.getElementById('inventory').children;
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    hotbarEls[i].innerHTML = '';
    if (hotbar[i]) hotbarEls[i].appendChild(createPetalElement(hotbar[i]));
  }
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    invEls[i].innerHTML = '';
    if (inventory[i]) invEls[i].appendChild(createPetalElement(inventory[i]));
  }
}

function handleDrop(e) {
  const targetSlot = parseInt(e.currentTarget.dataset.slot);
  const targetType = e.currentTarget.dataset.type;
  const petalId = parseInt(e.dataTransfer.getData('text/plain'));

  let fromIndex = inventory.findIndex(p => p && p.id === petalId);
  let fromType = 'inventory';
  if (fromIndex === -1) {
    fromIndex = hotbar.findIndex(p => p && p.id === petalId);
    fromType = 'hotbar';
  }

  if (fromIndex === -1) return;
  const movingPetal = (fromType === 'inventory' ? inventory : hotbar)[fromIndex];

  if ((targetType === 'inventory' && inventory[targetSlot]) ||
      (targetType === 'hotbar' && hotbar[targetSlot])) return;

  if (targetType === 'inventory') inventory[targetSlot] = movingPetal;
  else hotbar[targetSlot] = movingPetal;

  if (fromType === 'inventory') inventory[fromIndex] = null;
  else hotbar[fromIndex] = null;

  renderInventory();
  sendInventoryUpdate();
}

function sendInventoryUpdate() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    type: 'updateInventory',
    hotbar,
    inventory
  }));
}

requestAnimationFrame(gameLoop);

