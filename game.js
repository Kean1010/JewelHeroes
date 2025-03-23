const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const Engine = Matter.Engine;
const World = Matter.World;
const Bodies = Matter.Bodies;

const engine = Engine.create();
const world = engine.world;
engine.gravity.y = 0;

// Responsive canvas size
const cols = 10;
const rows = 10;
const minDimension = Math.min(window.innerWidth, window.innerHeight) * 0.9; // 90% of smallest dimension
const jewelSize = minDimension / cols;
canvas.width = jewelSize * cols;
canvas.height = jewelSize * rows;

// Game variables
let jewels = [];
let score = 0;
const colors = ['red', 'blue', 'green', 'yellow', 'purple'];
let selectedJewel = null;
let swapping = false;
let swapProgress = 0;
let jewelToSwap1 = null;
let jewelToSwap2 = null;
let animatingJewels = [];
let dropping = false;
let lastClickTime = 0;
const doubleClickThreshold = 300;

// Create a jewel (bomb uses circle shape)
function addJewel(col, row, color, isBomb = false) {
  const x = col * jewelSize + jewelSize / 2;
  const y = row * jewelSize + jewelSize / 2;
  const jewel = isBomb 
    ? Bodies.circle(x, y, jewelSize / 2 - 1, { isStatic: true, render: { fillStyle: 'black' } })
    : Bodies.rectangle(x, y, jewelSize - 2, jewelSize - 2, { isStatic: true, render: { fillStyle: color } });
  jewels.push({ body: jewel, color, col, row, alpha: 1, targetY: y, isBomb, isActive: false });
  World.add(world, jewel);
}

// Check for 3+ in a row or column at a specific position
function hasMatch(col, row, color) {
  let hCount = 1;
  for (let dx = -1; dx <= 1; dx += 2) {
    let c = col + dx;
    while (c >= 0 && c < cols && jewels.find(j => j.col === c && j.row === row && j.color === color && !j.isBomb)) {
      hCount++;
      c += dx;
    }
  }
  if (hCount >= 3) return true;

  let vCount = 1;
  for (let dy = -1; dy <= 1; dy += 2) {
    let r = row + dy;
    while (r >= 0 && r < rows && jewels.find(j => j.col === col && j.row === r && j.color === color && !j.isBomb)) {
      vCount++;
      r += dy;
    }
  }
  if (vCount >= 3) return true;

  return false;
}

// Populate grid without initial matches
function populateJewels() {
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      let color;
      do {
        color = colors[Math.floor(Math.random() * colors.length)];
      } while (hasMatch(col, row, color));
      addJewel(col, row, color);
    }
  }
}

populateJewels();

// Check if neighbors
function areNeighbors(j1, j2) {
  const dc = Math.abs(j1.col - j2.col);
  const dr = Math.abs(j1.row - j2.row);
  return (dc === 1 && dr === 0) || (dc === 0 && dr === 1);
}

// Start swap animation
function startSwap(j1, j2) {
  swapping = true;
  swapProgress = 0;
  jewelToSwap1 = j1;
  jewelToSwap2 = j2;
  j1.startX = j1.body.position.x;
  j1.startY = j1.body.position.y;
  j2.startX = j2.body.position.x;
  j2.startY = j2.body.position.y;
}

// Drop jewels in a column
function dropJewels() {
  dropping = true;
  for (let col = 0; col < cols; col++) {
    let columnJewels = jewels.filter(j => j.col === col).sort((a, b) => b.row - a.row);
    for (let row = rows - 1, i = 0; row >= 0; row--) {
      if (i < columnJewels.length) {
        const jewel = columnJewels[i];
        jewel.row = row;
        jewel.targetY = row * jewelSize + jewelSize / 2;
        i++;
      } else {
        const color = colors[Math.floor(Math.random() * colors.length)];
        addJewel(col, row, color);
      }
    }
  }
}

// Activate bomb and destroy 5x5 grid
function activateBomb(bomb) {
  const col = bomb.col;
  const row = bomb.row;
  const toRemove = jewels.filter(j => 
    j.col >= col - 2 && j.col <= col + 2 &&
    j.row >= row - 2 && j.row <= row + 2
  );
  toRemove.forEach(jewel => {
    jewel.animating = true;
    animatingJewels.push(jewel);
  });
  if (toRemove.length > 0) {
    setTimeout(dropJewels, 500);
  }
}

// Check for any 3+ matches across the board and handle 5+ powerup
function checkMatches() {
  const toRemove = new Set();
  let bombCandidate = swapping ? jewelToSwap1 : null;

  // Check all rows
  for (let row = 0; row < rows; row++) {
    let currentColor = null;
    let streak = [];
    for (let col = 0; col < cols; col++) {
      const jewel = jewels.find(j => j.row === row && j.col === col && !j.isBomb);
      if (jewel && jewel.color === currentColor) {
        streak.push(jewel);
      } else {
        if (streak.length >= 5 && bombCandidate && streak.includes(bombCandidate)) {
          streak.forEach(j => toRemove.add(j));
          const bombCol = bombCandidate.col;
          const bombRow = bombCandidate.row;
          World.remove(world, bombCandidate.body);
          jewels = jewels.filter(j => j !== bombCandidate);
          addJewel(bombCol, bombRow, 'black', true);
        } else if (streak.length >= 3) {
          streak.forEach(j => toRemove.add(j));
        }
        streak = jewel ? [jewel] : [];
        currentColor = jewel ? jewel.color : null;
      }
    }
    if (streak.length >= 5 && bombCandidate && streak.includes(bombCandidate)) {
      streak.forEach(j => toRemove.add(j));
      const bombCol = bombCandidate.col;
      const bombRow = bombCandidate.row;
      World.remove(world, bombCandidate.body);
      jewels = jewels.filter(j => j !== bombCandidate);
      addJewel(bombCol, bombRow, 'black', true);
    } else if (streak.length >= 3) {
      streak.forEach(j => toRemove.add(j));
    }
  }

  // Check all columns
  for (let col = 0; col < cols; col++) {
    let currentColor = null;
    let streak = [];
    for (let row = 0; row < rows; row++) {
      const jewel = jewels.find(j => j.col === col && j.row === row && !j.isBomb);
      if (jewel && jewel.color === currentColor) {
        streak.push(jewel);
      } else {
        if (streak.length >= 5 && bombCandidate && streak.includes(bombCandidate)) {
          streak.forEach(j => toRemove.add(j));
          const bombCol = bombCandidate.col;
          const bombRow = bombCandidate.row;
          World.remove(world, bombCandidate.body);
          jewels = jewels.filter(j => j !== bombCandidate);
          addJewel(bombCol, bombRow, 'black', true);
        } else if (streak.length >= 3) {
          streak.forEach(j => toRemove.add(j));
        }
        streak = jewel ? [jewel] : [];
        currentColor = jewel ? jewel.color : null;
      }
    }
    if (streak.length >= 5 && bombCandidate && streak.includes(bombCandidate)) {
      streak.forEach(j => toRemove.add(j));
      const bombCol = bombCandidate.col;
      const bombRow = bombCandidate.row;
      World.remove(world, bombCandidate.body);
      jewels = jewels.filter(j => j !== bombCandidate);
      addJewel(bombCol, bombRow, 'black', true);
    } else if (streak.length >= 3) {
      streak.forEach(j => toRemove.add(j));
    }
  }

  toRemove.forEach(jewel => {
    jewel.animating = true;
    animatingJewels.push(jewel);
  });

  if (toRemove.size > 0) {
    setTimeout(dropJewels, 500);
  }
}

// Game loop
function gameLoop() {
  Engine.update(engine, 1000 / 60);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (swapping) {
    swapProgress += 0.05;
    const t = Math.min(swapProgress, 1);
    const pos1 = {
      x: jewelToSwap1.startX + (jewelToSwap2.startX - jewelToSwap1.startX) * t,
      y: jewelToSwap1.startY + (jewelToSwap2.startY - jewelToSwap1.startY) * t
    };
    const pos2 = {
      x: jewelToSwap2.startX + (jewelToSwap1.startX - jewelToSwap2.startX) * t,
      y: jewelToSwap2.startY + (jewelToSwap1.startY - jewelToSwap2.startY) * t
    };
    Matter.Body.setPosition(jewelToSwap1.body, pos1);
    Matter.Body.setPosition(jewelToSwap2.body, pos2);

    if (t === 1) {
      swapping = false;
      const tempCol = jewelToSwap1.col;
      const tempRow = jewelToSwap1.row;
      jewelToSwap1.col = jewelToSwap2.col;
      jewelToSwap1.row = jewelToSwap2.row;
      jewelToSwap2.col = tempCol;
      jewelToSwap2.row = tempRow;
      checkMatches();
    }
  }

  animatingJewels.forEach((jewel, index) => {
    jewel.alpha -= 0.05;
    if (jewel.alpha <= 0) {
      World.remove(world, jewel.body);
      jewels = jewels.filter(j => j !== jewel);
      animatingJewels.splice(index, 1);
      score += 10;
    }
  });

  if (dropping) {
    let finished = true;
    jewels.forEach(jewel => {
      const currentY = jewel.body.position.y;
      if (currentY < jewel.targetY) {
        jewel.body.position.y += 5;
        if (jewel.body.position.y > jewel.targetY) jewel.body.position.y = jewel.targetY;
        finished = false;
      }
    });
    if (finished) {
      dropping = false;
      checkMatches();
    }
  }

  jewels.forEach(jewel => {
    const pos = jewel.body.position;
    ctx.globalAlpha = jewel.animating ? jewel.alpha : 1;
    if (jewel.isBomb) {
      ctx.fillStyle = 'black';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, jewelSize / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = jewel.color;
      ctx.fillRect(pos.x - jewelSize / 2, pos.y - jewelSize / 2, jewelSize - 2, jewelSize - 2);
    }
    if (jewel === selectedJewel && !swapping) {
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      if (jewel.isBomb) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, jewelSize / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(pos.x - jewelSize / 2, pos.y - jewelSize / 2, jewelSize - 2, jewelSize - 2);
      }
    }
    ctx.globalAlpha = 1;
  });

  document.getElementById('score').textContent = `Score: ${score}`;
  requestAnimationFrame(gameLoop);
}

// Handle clicks (and touches)
canvas.addEventListener('click', handleInput);
canvas.addEventListener('touchstart', handleInput, { passive: false });

function handleInput(e) {
  if (swapping || animatingJewels.length > 0 || dropping) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
  const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
  const clickX = clientX - rect.left;
  const clickY = clientY - rect.top;
  const currentTime = Date.now();

  const clickedJewel = jewels.find(j => {
    const pos = j.body.position;
    return Math.abs(pos.x - clickX) < jewelSize / 2 && Math.abs(pos.y - clickY) < jewelSize / 2;
  });

  if (clickedJewel) {
    if (clickedJewel.isBomb && !clickedJewel.isActive) {
      const timeSinceLastClick = currentTime - lastClickTime;
      if (timeSinceLastClick < doubleClickThreshold) {
        clickedJewel.isActive = true;
        activateBomb(clickedJewel);
        return;
      }
      lastClickTime = currentTime;
    }

    if (!selectedJewel) {
      selectedJewel = clickedJewel;
    } else if (clickedJewel !== selectedJewel && areNeighbors(selectedJewel, clickedJewel)) {
      if (selectedJewel.isBomb && !selectedJewel.isActive) {
        selectedJewel.isActive = true;
        activateBomb(selectedJewel);
      } else {
        startSwap(selectedJewel, clickedJewel);
      }
      selectedJewel = null;
    } else {
      selectedJewel = null;
    }
  }
}

gameLoop();
