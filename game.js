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
let hotbar = [null, null, null, null, null];
let inventory = new Array(INVENTORY_SIZE).fill(null);

let petalIdCounter = 1;

function createBasicPetal() {
  return {
    id: petalIdCounter++,
    type: 'basic',
    damage: 5,
    color: 'cyan',
    angle: 0
  };
}

document.getElementById('start-button').onclick = () => {
  username = document.getElementById('username-input').value.trim();
  if (!username) return;

  document.getElementById('username-screen').style.display = 'none';

  socket = new WebSocket('wss://plorrabackend.onrender.com');

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'join', username }));

    // Start with some petals
    for (let i = 0; i < 5; i++) {
      inventory[i] = createBasicPetal();
    }

    initInventoryUI();
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'init') playerId = data.id;
    else if (data.type === 'state') {
      players = data.players || {};
      mobs = data.mobs || {};
      petalsOnGround = data.petalsOnGround || {};
    }
  };
};

const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function gameLoop() {
  if (!playerId || !players[playerId]) return requestAnimationFrame(gameLoop);

  const me = players[playerId];
  if (keys['w']) me.y -= 3;
  if (keys['s']) me.y += 3;
  if (keys['a']) me.x -= 3;
  if (keys['d']) me.x += 3;

  camera.x = me.x - canvas.width / 2;
  camera.y = me.y - canvas.height / 2;

  socket.send(JSON.stringify({ type: 'move', x: me.x, y: me.y }));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw petals on ground
  Object.values(petalsOnGround).forEach(petal => {
    const screenX = petal.x - camera.x;
    const screenY = petal.y - camera.y;
    ctx.fillStyle = petal.color;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw mobs with health bars
  Object.values(mobs).forEach(mob => {
    const screenX = mob.x - camera.x;
    const screenY = mob.y - camera.y;

    ctx.fillStyle = mob.color;
    ctx.beginPath();

    if (mob.shape === 'circle') {
      ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
      ctx.fill();
    } else if (mob.shape === 'triangle') {
      ctx.moveTo(screenX, screenY - 20);
      ctx.lineTo(screenX - 17, screenY + 10);
      ctx.lineTo(screenX + 17, screenY + 10);
      ctx.closePath();
      ctx.fill();
    }

    // Health bar
    ctx.fillStyle = 'red';
    ctx.fillRect(screenX - 20, screenY - 30, 40, 5);
    ctx.fillStyle = 'lime';
    ctx.fillRect(screenX - 20, screenY - 30, 40 * (mob.hp / mob.maxHp), 5);
  });

  // Draw players with health bars and username
  for (const id in players) {
    const p = players[id];
    const screenX = p.x - camera.x;
    const screenY = p.y - camera.y;

    ctx.fillStyle = id === playerId ? '#4df' : '#fff';
    ctx.beginPath();
    ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.username, screenX, screenY - 30);

    // Player health bar
    ctx.fillStyle = 'red';
    ctx.fillRect(screenX - 20, screenY + 25, 40, 5);
    ctx.fillStyle = 'lime';
    ctx.fillRect(screenX - 20, screenY + 25, 40 * (p.hp / p.maxHp), 5);

    // Draw orbiting petals for local player only
    if (id === playerId) {
      const radius = 40;
      const activePetals = hotbar.filter(Boolean);
      const step = (Math.PI * 2) / (activePetals.length || 1);

      activePetals.forEach((petal, i) => {
        petal.angle += 0.05;
        const px = screenX + Math.cos(petal.angle + i * step) * radius;
        const py = screenY + Math.sin(petal.angle + i * step) * radius;
        ctx.fillStyle = petal.color;
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // Check for petal pickup
  Object.values(petalsOnGround).forEach(petal => {
    const dist = Math.hypot(me.x - petal.x, me.y - petal.y);
    if (dist < 30) {
      // Pick it up: add to inventory if space
      let placed = false;
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        if (!inventory[i]) {
          inventory[i] = {
            id: petal.id,
            type: petal.type,
            damage: petal.damage,
            color: petal.color,
            angle: 0,
          };
          placed = true;
          break;
        }
      }
      if (placed) {
        delete petalsOnGround[petal.id];
        sendInventoryUpdate();
      }
    }
  });

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

  renderInventory();
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
  el.style.width = el.style.height = '100%';
  el.style.background = petal.color;
  el.title = `${petal.type} (${petal.damage} dmg)`;
  el.dataset.id = petal.id;
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

