/* ===================== CANVAS ===================== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/* ===================== CHARGEMENT DES SPRITES REELS ===================== */
// Charge les PNG générés via le pipeline ComfyUI (dossier assets/buildings/).
// Tant qu'une image n'est pas chargée, drawBuilding utilise le rendu procédural de secours.
const BUILDING_SPRITES = {};
Object.entries(BUILDING_DEFS).forEach(([key, def]) => {
  if (!def.sprite) return;
  const img = new Image();
  img.onload = () => { debugInfo(`Sprite chargé : ${def.sprite}`); render(); };
  img.onerror = () => debugWarn(`Sprite introuvable : ${def.sprite} (vérifie qu'il est dans assets/buildings/)`);
  img.src = def.sprite;
  BUILDING_SPRITES[key] = img;
});

/* ===================== PRIMITIVES DE DESSIN ===================== */
function drawDiamond(cx, cy, fillColor, strokeColor){
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H/2);
  ctx.lineTo(cx + TILE_W/2, cy);
  ctx.lineTo(cx, cy + TILE_H/2);
  ctx.lineTo(cx - TILE_W/2, cy);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor || 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function shade(hex, percent){
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00FF) + percent;
  let b = (num & 0x0000FF) + percent;
  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);
  return '#' + (r.toString(16).padStart(2,'0')) + (g.toString(16).padStart(2,'0')) + (b.toString(16).padStart(2,'0'));
}

/* ===================== RENDU BATIMENTS ===================== */
function drawBuilding(cx, cy, type, col, row){
  const def = BUILDING_DEFS[type];

  if (def.isHouse){
    const cell = grid[row][col];
    const variant = composeHouseVariant(hashSeed(col, row));
    variant.widthScale *= 1 + cell.houseLevel * 0.18; // grandit visuellement avec le niveau
    drawHouse(cx, cy, variant);
    return;
  }

  const sprite = BUILDING_SPRITES[type];
  if (sprite && sprite.complete && sprite.naturalWidth > 0){
    const targetW = 92;
    const scale = targetW / sprite.naturalWidth;
    const targetH = sprite.naturalHeight * scale;
    const drawX = cx - targetW / 2;
    const drawY = cy + TILE_H / 2 - targetH + 10;
    ctx.drawImage(sprite, drawX, drawY, targetW, targetH);
    return;
  }

  // ---- repli procédural (sprite pas encore chargé ou absent) ----
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy - 24);
  ctx.lineTo(cx + 20, cy - 24);
  ctx.lineTo(cx, cy - 40);
  ctx.closePath();
  ctx.fillStyle = shade(def.color, -25);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  roundRect(cx - 18, cy - 24, 36, 26, 4);
  ctx.fillStyle = def.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.icon, cx, cy - 6);
}

/* ---- Rendu procédural des maisons (modules : corps, toit, bande, annexe) ---- */
function drawBoxFaces(cx, baseY, topY, w, footH, leftColor, rightColor){
  ctx.beginPath();
  ctx.moveTo(cx - w, baseY);
  ctx.lineTo(cx, baseY + footH);
  ctx.lineTo(cx, topY + footH);
  ctx.lineTo(cx - w, topY);
  ctx.closePath();
  ctx.fillStyle = leftColor; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, baseY + footH);
  ctx.lineTo(cx + w, baseY);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + footH);
  ctx.closePath();
  ctx.fillStyle = rightColor; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
}

function drawFlatRoof(cx, topY, w, footH, color){
  ctx.beginPath();
  ctx.moveTo(cx, topY - footH);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + footH);
  ctx.lineTo(cx - w, topY);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
}

function drawTrimBand(cx, topY, w, footH, color){
  const bandH = 4;
  ctx.beginPath();
  ctx.moveTo(cx - w, topY);
  ctx.lineTo(cx - w, topY + bandH);
  ctx.lineTo(cx, topY + footH + bandH);
  ctx.lineTo(cx, topY + footH);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, topY + footH);
  ctx.lineTo(cx, topY + footH + bandH);
  ctx.lineTo(cx + w, topY + bandH);
  ctx.lineTo(cx + w, topY);
  ctx.closePath();
  ctx.fillStyle = shade(color, -10); ctx.fill();
}

function drawHouse(cx, cy, v){
  const w = 30 * v.widthScale;
  const footH = w / 2;
  const wallH = 24;
  const baseY = cy + (TILE_H / 2 - footH);
  const topY = baseY - wallH;

  if (v.hasAnnex){
    const aw = w * 0.55;
    const afh = aw / 2;
    const ax = cx - w - aw * 0.3;
    const aWallH = wallH * 0.65;
    const abaseY = baseY + 2;
    const atopY = abaseY - aWallH;
    drawBoxFaces(ax, abaseY, atopY, aw, afh, shade(v.wallColor, -25), shade(v.wallColor, -10));
    drawFlatRoof(ax, atopY, aw, afh, shade(v.roofColor, -15));
  }

  drawBoxFaces(cx, baseY, topY, w, footH, shade(v.wallColor, -20), v.wallColor);

  if (v.hasTrim){
    drawTrimBand(cx, topY, w, footH, v.trimColor);
  }

  if (v.roofShape === 'pyramid'){
    const apex = { x: cx, y: topY - footH - w * 0.9 };
    ctx.beginPath();
    ctx.moveTo(cx - w, topY); ctx.lineTo(cx, topY + footH); ctx.lineTo(apex.x, apex.y); ctx.closePath();
    ctx.fillStyle = shade(v.roofColor, -15); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, topY + footH); ctx.lineTo(cx + w, topY); ctx.lineTo(apex.x, apex.y); ctx.closePath();
    ctx.fillStyle = v.roofColor; ctx.fill(); ctx.stroke();
  } else if (v.roofShape === 'dome'){
    const domeH = w * 0.9;
    ctx.beginPath();
    ctx.ellipse(cx, topY - domeH * 0.35, w * 0.75, domeH * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = v.roofColor; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
  } else {
    drawFlatRoof(cx, topY, w, footH, v.roofColor);
  }
}

/* ===================== RENDU ROUTE ===================== */
function drawRoad(cx, cy){
  // tuile de route légèrement plus petite que la tuile de terrain, pour qu'on voie
  // encore la couleur du terrain en bordure (effet "chemin tracé sur le sol")
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H * 0.4);
  ctx.lineTo(cx + TILE_W * 0.4, cy);
  ctx.lineTo(cx, cy + TILE_H * 0.4);
  ctx.lineTo(cx - TILE_W * 0.4, cy);
  ctx.closePath();
  ctx.fillStyle = '#9c8868';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();
}

/* ===================== RENDU PRINCIPAL ===================== */
function render(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // tuiles + routes + bâtiments, triés en diagonale pour la profondeur
  for (let sum = 0; sum <= (GRID_COLS - 1) + (GRID_ROWS - 1); sum++){
    for (let col = 0; col < GRID_COLS; col++){
      const row = sum - col;
      if (row < 0 || row >= GRID_ROWS) continue;
      const cell = grid[row][col];
      const { x, y } = tileCenter(col, row);
      drawDiamond(x, y, TERRAIN_COLORS[cell.terrain]);
      if (cell.hasRoad){
        drawRoad(x, y);
      }
      if (cell.building){
        drawBuilding(x, y, cell.building, col, row);
      }
    }
  }

  // surbrillance de la case survolée
  if (hoverTile && inBounds(hoverTile.col, hoverTile.row)){
    const { x, y } = tileCenter(hoverTile.col, hoverTile.row);
    let color = 'rgba(255,255,255,0.35)';
    if (selectedBuilding){
      color = canPlace(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (roadMode){
      color = canPlaceRoad(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (demolishMode){
      const c = grid[hoverTile.row][hoverTile.col];
      color = (c.building || c.hasRoad) ? 'rgba(255,60,60,0.45)' : 'rgba(255,255,255,0.2)';
    }
    drawDiamond(x, y, color, 'rgba(0,0,0,0.4)');
  }
}
