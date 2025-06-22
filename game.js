const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let socket;
let playerId = null;
let players = {};
let username = '';
let camera = { x: 0, y: 0 };

document.getElementById('start-button').onclick = () => {
  username = document.getElementById('username-input').value.trim();
  if (!username) return;

  document.getElementById('username-screen').style.display = 'none';

  socket = new WebSocket('wss://factionwarsbackend.onrender.com'); // Replace with your Render WebSocket URL

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'join', username }));
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'init') playerId = data.id;
    else if (data.type === 'state') players = data.players;
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
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
