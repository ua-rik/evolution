const CONFIG = {
  gridSize: 50,
  cellSize: 12,
  populations: 6,
  pixelsPerPopulation: 100,
  genesPerPixel: 8,
  mutationChance: 0.2,
  tickDuration: 200,
};

const BOARD_COLORS = {
  background: "#101010",
  grid: "rgba(255,255,255,0.03)",
};

const GENE_TYPES = ["attack", "defense", "speed", "hp"];
const GENE_SYMBOL = {
  attack: "A",
  defense: "D",
  speed: "S",
  hp: "H",
};

const directions = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const toggleButton = document.getElementById("toggleButton");
const logList = document.getElementById("logList");
const tooltip = document.getElementById("tooltip");

canvas.width = CONFIG.gridSize * CONFIG.cellSize;
canvas.height = CONFIG.gridSize * CONFIG.cellSize;

const board = Array.from({ length: CONFIG.gridSize }, () => Array(CONFIG.gridSize).fill(null));
const pixels = new Map();
let pixelIdCounter = 0;
let isRunning = false;
let lastTick = 0;
const combatLogs = [];

class Pixel {
  constructor(x, y, genes, populationId) {
    this.id = pixelIdCounter++;
    this.x = x;
    this.y = y;
    this.genes = genes;
    this.populationId = populationId;
    this.maxHp = Math.max(1, genes.hp);
    this.hp = this.maxHp;
    this.color = genesToColor(genes);
    this.geneCode = genesToCode(genes);
  }
}

function randomGenes(total) {
  const genes = { attack: 0, defense: 0, speed: 0, hp: 0 };
  for (let i = 0; i < total; i += 1) {
    const type = GENE_TYPES[Math.floor(Math.random() * GENE_TYPES.length)];
    genes[type] += 1;
  }
  if (genes.hp === 0) {
    genes.hp = 1;
  }
  return genes;
}

function genesToColor(genes) {
  const total = Math.max(1, GENE_TYPES.reduce((sum, type) => sum + genes[type], 0));
  const r = Math.round((genes.attack / total) * 255);
  const g = Math.round((genes.speed / total) * 255);
  const b = Math.round((genes.defense / total) * 255);
  const brightness = 0.4 + Math.min(0.6, genes.hp / total);
  return `rgb(${Math.round(r * brightness)}, ${Math.round(g * brightness)}, ${Math.round(b * brightness)})`;
}

function genesToCode(genes) {
  return GENE_TYPES.flatMap((type) => Array(genes[type]).fill(GENE_SYMBOL[type])).join("");
}

function placePixel(pixel) {
  if (board[pixel.y][pixel.x]) return false;
  board[pixel.y][pixel.x] = pixel.id;
  pixels.set(pixel.id, pixel);
  return true;
}

function removePixel(pixel) {
  board[pixel.y][pixel.x] = null;
  pixels.delete(pixel.id);
}

function initialisePopulations() {
  for (let populationId = 0; populationId < CONFIG.populations; populationId += 1) {
    const genes = randomGenes(CONFIG.genesPerPixel);
    const baseX = Math.floor(Math.random() * CONFIG.gridSize);
    const baseY = Math.floor(Math.random() * CONFIG.gridSize);
    for (let i = 0; i < CONFIG.pixelsPerPopulation; i += 1) {
      const offsetX = Math.floor(Math.random() * 5) - 2;
      const offsetY = Math.floor(Math.random() * 5) - 2;
      const x = clamp(baseX + offsetX, 0, CONFIG.gridSize - 1);
      const y = clamp(baseY + offsetY, 0, CONFIG.gridSize - 1);
      const pixel = new Pixel(x, y, { ...genes }, populationId);
      placePixel(pixel);
    }
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mutateGenes(genes) {
  const newGenes = { ...genes };
  if (Math.random() < CONFIG.mutationChance) {
    const fromTypes = GENE_TYPES.filter((type) => newGenes[type] > (type === "hp" ? 1 : 0));
    if (fromTypes.length > 0) {
      const from = fromTypes[Math.floor(Math.random() * fromTypes.length)];
      let to;
      do {
        to = GENE_TYPES[Math.floor(Math.random() * GENE_TYPES.length)];
      } while (to === from && GENE_TYPES.length > 1);
      newGenes[from] -= 1;
      newGenes[to] += 1;
    }
  }
  return newGenes;
}

function stepSimulation() {
  const currentPixels = Array.from(pixels.values());
  shuffle(currentPixels);
  for (const pixel of currentPixels) {
    if (!pixels.has(pixel.id)) continue;
    const steps = Math.max(1, pixel.genes.speed);
    for (let step = 0; step < steps; step += 1) {
      const dir = directions[Math.floor(Math.random() * directions.length)];
      const nx = clamp(pixel.x + dir.dx, 0, CONFIG.gridSize - 1);
      const ny = clamp(pixel.y + dir.dy, 0, CONFIG.gridSize - 1);
      if (nx === pixel.x && ny === pixel.y) continue;
      const occupantId = board[ny][nx];
      if (!occupantId) {
        board[pixel.y][pixel.x] = null;
        pixel.x = nx;
        pixel.y = ny;
        board[ny][nx] = pixel.id;
      } else if (occupantId !== pixel.id) {
        const opponent = pixels.get(occupantId);
        if (!opponent) continue;
        if (pixel.geneCode === opponent.geneCode) {
          continue;
        }
        const winner = resolveCombat(pixel, opponent);
        if (!winner) {
          break;
        }
        if (winner.id === pixel.id) {
          board[pixel.y][pixel.x] = null;
          pixel.x = nx;
          pixel.y = ny;
          board[ny][nx] = pixel.id;
        }
        break;
      }
    }
  }
}

function resolveCombat(attacker, defender) {
  const first = attacker.genes.speed > defender.genes.speed
    ? attacker
    : attacker.genes.speed < defender.genes.speed
      ? defender
      : attacker;
  const second = first === attacker ? defender : attacker;
  let turn = first;
  let opponent = second;

  while (attacker.hp > 0 && defender.hp > 0) {
    const damage = Math.max(1, turn.genes.attack - opponent.genes.defense);
    opponent.hp -= damage;
    if (opponent.hp <= 0) {
      break;
    }
    [turn, opponent] = [opponent, turn];
  }

  const winner = attacker.hp > 0 ? attacker : defender;
  const loser = winner === attacker ? defender : attacker;

  logCombat(winner, loser);

  if (loser.hp <= 0) {
    removePixel(loser);
  }
  winner.hp = winner.maxHp;

  createOffspring(winner);

  return winner;
}

function createOffspring(parent) {
  const offsets = [];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > 2) continue;
      offsets.push({ dx, dy });
    }
  }
  shuffle(offsets);
  for (const { dx, dy } of offsets) {
    const nx = parent.x + dx;
    const ny = parent.y + dy;
    if (nx < 0 || ny < 0 || nx >= CONFIG.gridSize || ny >= CONFIG.gridSize) continue;
    if (board[ny][nx]) continue;
    const genes = mutateGenes(parent.genes);
    const child = new Pixel(nx, ny, genes, parent.populationId);
    placePixel(child);
    return;
  }
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function drawBoard() {
  const size = CONFIG.gridSize;
  const cell = CONFIG.cellSize;

  ctx.fillStyle = BOARD_COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = BOARD_COLORS.grid;
  ctx.lineWidth = 1;

  for (let i = 0; i <= size; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell + 0.5, 0);
    ctx.lineTo(i * cell + 0.5, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell + 0.5);
    ctx.lineTo(canvas.width, i * cell + 0.5);
    ctx.stroke();
  }

  for (const pixel of pixels.values()) {
    ctx.fillStyle = pixel.color;
    ctx.fillRect(pixel.x * cell, pixel.y * cell, cell, cell);
  }
}

function logCombat(winner, loser) {
  const entry = `${winner.geneCode || "?"} kill ${loser.geneCode || "?"}`;
  combatLogs.push(entry);
  if (combatLogs.length > 20) {
    combatLogs.splice(0, combatLogs.length - 20);
  }
  renderLogs();
}

function renderLogs() {
  logList.innerHTML = "";
  for (const log of combatLogs.slice().reverse()) {
    const li = document.createElement("li");
    li.textContent = log;
    logList.appendChild(li);
  }
}

function updateTooltip(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const cellX = Math.floor((x / rect.width) * CONFIG.gridSize);
  const cellY = Math.floor((y / rect.height) * CONFIG.gridSize);
  if (cellX < 0 || cellY < 0 || cellX >= CONFIG.gridSize || cellY >= CONFIG.gridSize) {
    tooltip.hidden = true;
    return;
  }
  const occupantId = board[cellY][cellX];
  if (!occupantId) {
    tooltip.hidden = true;
    return;
  }
  const pixel = pixels.get(occupantId);
  if (!pixel) {
    tooltip.hidden = true;
    return;
  }
  tooltip.textContent = pixel.geneCode || "-";
  tooltip.style.left = `${event.clientX - rect.left}px`;
  tooltip.style.top = `${event.clientY - rect.top}px`;
  tooltip.hidden = false;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function toggleSimulation() {
  isRunning = !isRunning;
  toggleButton.textContent = isRunning ? "⏸ Пауза" : "▶ Запустити";
}

function loop(timestamp) {
  if (isRunning && timestamp - lastTick > CONFIG.tickDuration) {
    stepSimulation();
    lastTick = timestamp;
  }
  drawBoard();
  requestAnimationFrame(loop);
}

function setup() {
  initialisePopulations();
  drawBoard();
  requestAnimationFrame(loop);
}

toggleButton.addEventListener("click", toggleSimulation);
canvas.addEventListener("mousemove", updateTooltip);
canvas.addEventListener("mouseleave", hideTooltip);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup);
} else {
  setup();
}
