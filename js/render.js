/* ===================== CANVAS ===================== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high'; // meilleur rendu des sprites PNG mis à l'échelle (zoom)

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

// Sprites de maison par niveau (assets/houses/). Repli procédural si absent.
const HOUSE_SPRITES = {};
HOUSE_LEVELS.forEach(lvl => {
  if (!lvl.sprite) return;
  const img = new Image();
  img.onload = () => { debugInfo(`Sprite chargé : ${lvl.sprite}`); render(); };
  img.onerror = () => debugWarn(`Sprite de maison introuvable : ${lvl.sprite}`);
  img.src = lvl.sprite;
  HOUSE_SPRITES[lvl.key] = img;
});

// Sprites de sol (losanges iso). Tant qu'ils ne sont pas chargés, on dessine
// un losange de couleur unie (TERRAIN_COLORS) en repli.
const TERRAIN_SPRITE_IMAGES = {};
Object.entries(TERRAIN_SPRITES).forEach(([key, path]) => {
  const img = new Image();
  img.onload = () => { debugInfo(`Sprite de terrain chargé : ${path}`); render(); };
  img.onerror = () => debugWarn(`Sprite de terrain introuvable : ${path}`);
  img.src = path;
  TERRAIN_SPRITE_IMAGES[key] = img;
});

// Sprite de route (dallage iso). Repli : losange brun procédural.
const ROAD_SPRITE = new Image();
ROAD_SPRITE.onload = () => { debugInfo(`Sprite de route chargé : ${ROAD_SPRITE_PATH}`); render(); };
ROAD_SPRITE.onerror = () => debugWarn(`Sprite de route introuvable : ${ROAD_SPRITE_PATH}`);
ROAD_SPRITE.src = ROAD_SPRITE_PATH;

const WALKER_SPRITE = new Image();
WALKER_SPRITE.onload = () => debugInfo(`Sprite chargé : ${WALKER_SPRITE_PATH}`);
WALKER_SPRITE.onerror = () => debugWarn(`Sprite introuvable : ${WALKER_SPRITE_PATH}`);
WALKER_SPRITE.src = WALKER_SPRITE_PATH;

/* ===================== PRIMITIVES DE DESSIN ===================== */
// Dessine la case de terrain : sprite losange si disponible, sinon aplat de couleur.
function drawTerrainTile(cx, cy, terrain){
  const img = TERRAIN_SPRITE_IMAGES[terrain];
  if (img && img.complete && img.naturalWidth > 0){
    // léger débord (+1px) pour masquer les coutures entre tuiles voisines
    ctx.drawImage(img, cx - TILE_W / 2 - 0.5, cy - TILE_H / 2 - 0.5, TILE_W + 1, TILE_H + 1);
  } else {
    drawDiamond(cx, cy, TERRAIN_COLORS[terrain]);
  }
}

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
// Pose un sprite ancré sur la base de la tuile (mêmes proportions pour bâtiments et maisons).
function drawSpriteOnTile(cx, cy, sprite, targetW){
  targetW = targetW || 92;
  const scale = targetW / sprite.naturalWidth;
  const targetH = sprite.naturalHeight * scale;
  ctx.drawImage(sprite, cx - targetW / 2, cy + TILE_H / 2 - targetH + 10, targetW, targetH);
}

// Sprite de maison à utiliser pour un niveau : le sien, sinon le plus haut niveau
// inférieur qui a un sprite (ex. domaine/résidence/palais retombent sur villa).
function houseSpriteForLevel(level){
  for (let i = level; i >= 0; i--){
    const img = HOUSE_SPRITES[HOUSE_LEVELS[i].key];
    if (img && img.complete && img.naturalWidth > 0) return img;
  }
  return null;
}

function drawBuilding(cx, cy, type, col, row){
  const def = BUILDING_DEFS[type];

  if (def.isHouse){
    const cell = grid[row][col];
    const sprite = houseSpriteForLevel(cell.houseLevel);
    if (sprite){
      drawSpriteOnTile(cx, cy, sprite);
      return;
    }
    // repli procédural si aucun sprite n'est encore chargé
    const variant = composeHouseVariant(hashSeed(col, row));
    variant.widthScale *= 1 + cell.houseLevel * 0.18; // grandit visuellement avec le niveau
    drawHouse(cx, cy, variant);
    return;
  }

  if (def.isDecoration){
    drawDecoration(cx, cy, type);
    return;
  }

  const sprite = BUILDING_SPRITES[type];
  if (sprite && sprite.complete && sprite.naturalWidth > 0){
    drawSpriteOnTile(cx, cy, sprite);
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

/* ===================== RENDU DECORATIONS ===================== */
// Rendu procédural simple par type de décoration (pas de sprite réel pour
// l'instant — repli géométrique, comme les bâtiments sans PNG).
function drawDecoration(cx, cy, type){
  const baseY = cy + TILE_H / 2;
  const stroke = 'rgba(0,0,0,0.35)';

  if (type === 'statue'){
    ctx.fillStyle = '#b9b2a3';                 // socle
    ctx.fillRect(cx - 8, baseY - 10, 16, 10);
    ctx.strokeStyle = stroke; ctx.strokeRect(cx - 8, baseY - 10, 16, 10);
    ctx.fillStyle = '#ece6d8';                 // corps
    roundRect(cx - 5, baseY - 30, 10, 22, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath();                           // tête
    ctx.arc(cx, baseY - 33, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ece6d8'; ctx.fill(); ctx.stroke();
  } else if (type === 'garden'){
    const blobs = [[-8, -2, 7], [6, 0, 8], [0, -8, 7], [-2, 4, 6]];
    blobs.forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, baseY - 10 + dy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#5f8f3e'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke();
    });
    ctx.fillStyle = '#e8c468';                 // quelques fleurs
    [[-6, -6], [5, -4], [-1, -10]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, baseY - 10 + dy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (type === 'colonnade'){
    [-10, 0, 10].forEach(dx => {
      ctx.fillStyle = '#efe9da';               // fût
      ctx.fillRect(cx + dx - 3, baseY - 26, 6, 24);
      ctx.strokeStyle = stroke; ctx.strokeRect(cx + dx - 3, baseY - 26, 6, 24);
      ctx.fillStyle = '#d9d2c0';               // chapiteau
      ctx.fillRect(cx + dx - 5, baseY - 29, 10, 4);
    });
    ctx.fillStyle = '#d9d2c0';                 // entablement
    ctx.fillRect(cx - 14, baseY - 33, 28, 5);
    ctx.strokeStyle = stroke; ctx.strokeRect(cx - 14, baseY - 33, 28, 5);
  }
}

/* ===================== RENDU ROUTE ===================== */
function drawRoad(cx, cy){
  // sprite de dallage iso si disponible (couvre toute la tuile, léger débord pour
  // masquer les coutures), sinon repli losange brun procédural.
  if (ROAD_SPRITE.complete && ROAD_SPRITE.naturalWidth > 0){
    ctx.drawImage(ROAD_SPRITE, cx - TILE_W / 2 - 0.5, cy - TILE_H / 2 - 0.5, TILE_W + 1, TILE_H + 1);
    return;
  }
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

function drawPatrolBlock(cx, cy){
  // petite borne (façon horos grec) signalant un demi-tour forcé du walker
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(cx - 3, cy - 12, 6, 12);
  ctx.beginPath();
  ctx.arc(cx, cy - 13, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#cfcac0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
}

/* ===================== RENDU WALKERS ===================== */
// Couleur par métier, pour distinguer d'un coup d'œil qui parcourt la ville
// (signature "ville vivante" des jeux Impressions).
const SERVICE_COLORS = {
  water:    '#5a8fae',
  market:   '#c97b3d',
  religion: '#c4b27a',
  health:   '#9ec2c4',
};

function drawWalkers(now){
  const spriteReady = WALKER_SPRITE.complete && WALKER_SPRITE.naturalWidth > 0;

  walkers.forEach(w => {
    if (w.path.length <= 1) return; // non connecté, rien à animer
    const { x, y } = getWalkerScreenPos(w, now);
    const roleColor = SERVICE_COLORS[w.serviceType] || '#e8c468';

    if (spriteReady){
      const frame = Math.floor(now / WALKER_ANIM_FRAME_MS) % WALKER_FRAMES_PER_CYCLE;
      const sx = frame * WALKER_FRAME_SIZE;
      const sy = WALKER_DIRECTION_ROWS[w.facing] * WALKER_FRAME_SIZE;
      const d = WALKER_DISPLAY_SIZE;
      ctx.drawImage(
        WALKER_SPRITE,
        sx, sy, WALKER_FRAME_SIZE, WALKER_FRAME_SIZE,
        x - d / 2, y - d + 8, d, d
      );
      // pastille de rôle au-dessus de la tête
      ctx.beginPath();
      ctx.arc(x, y - d + 6, 4, 0, Math.PI * 2);
      ctx.fillStyle = roleColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // repli : petit cercle coloré selon le métier, tant que le sprite n'est pas chargé
      ctx.beginPath();
      ctx.arc(x, y - 6, 7, 0, Math.PI * 2);
      ctx.fillStyle = roleColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

/* ===================== ICONES DE STATUT DES MAISONS ===================== */
function drawHouseStatusIcons(cx, cy, col, row, cell){
  const icons = getHouseStatusIcons(col, row, cell);
  if (icons.length === 0) return;

  const iconSize = 11;
  const spacing = iconSize + 1;
  const startX = cx - ((icons.length - 1) * spacing) / 2;
  const y = cy - TILE_H / 2 - 38; // au-dessus du toit -- peut demander un ajustement fin selon le sprite

  ctx.font = `${iconSize}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  icons.forEach((icon, i) => {
    const x = startX + i * spacing;
    ctx.beginPath();
    ctx.arc(x, y, iconSize / 2 + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillText(icon, x, y + 1);
  });
}

/* ===================== RENDU PRINCIPAL ===================== */
function render(now){
  now = now || performance.now();

  // Réinitialise la transformation avant de nettoyer (sinon clearRect serait lui-même
  // affecté par le zoom et ne viderait pas tout le buffer réel).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Applique le zoom (+ devicePixelRatio pour la netteté sur écran haute densité) :
  // tout ce qui suit se dessine dans les coordonnées "monde" habituelles (TILE_W,
  // OFFSET_X...), redimensionnées par cette transformation -- jamais d'étirement
  // d'une image déjà dessinée.
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(zoomLevel * dpr, 0, 0, zoomLevel * dpr, 0, 0);

  // tuiles + routes + bâtiments, triés en diagonale pour la profondeur
  for (let sum = 0; sum <= (GRID_COLS - 1) + (GRID_ROWS - 1); sum++){
    for (let col = 0; col < GRID_COLS; col++){
      const row = sum - col;
      if (row < 0 || row >= GRID_ROWS) continue;
      const cell = grid[row][col];
      const { x, y } = tileCenter(col, row);
      drawTerrainTile(x, y, cell.terrain);
      if (cell.beauty){
        // voile doré : opacité proportionnelle au cachet, pour visualiser les zones embellies
        const alpha = Math.min(0.4, (cell.beauty / BEAUTY_THRESHOLD) * 0.4);
        drawDiamond(x, y, `rgba(214,175,70,${alpha})`, 'rgba(0,0,0,0)');
      }
      if (cell.hasRoad){
        drawRoad(x, y);
        if (cell.patrolBlock) drawPatrolBlock(x, y);
      }
      if (cell.building){
        drawBuilding(x, y, cell.building, col, row);
      }
    }
  }

  // icônes de statut des maisons : passe séparée, après tous les bâtiments, pour
  // qu'une icône ne se retrouve jamais cachée derrière un bâtiment dessiné après elle.
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = grid[row][col];
      if (cell.building === 'maison'){
        const { x, y } = tileCenter(col, row);
        drawHouseStatusIcons(x, y, col, row, cell);
      }
    }
  }

  drawWalkers(now);

  // surbrillance de la case survolée
  if (hoverTile && inBounds(hoverTile.col, hoverTile.row)){
    const { x, y } = tileCenter(hoverTile.col, hoverTile.row);
    let color = 'rgba(255,255,255,0.35)';
    if (selectedBuilding){
      color = canPlace(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (roadMode){
      color = canPlaceRoad(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (blockMode){
      color = canToggleBlock(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (demolishMode){
      const c = grid[hoverTile.row][hoverTile.col];
      color = (c.building || c.hasRoad) ? 'rgba(255,60,60,0.45)' : 'rgba(255,255,255,0.2)';
    }
    drawDiamond(x, y, color, 'rgba(0,0,0,0.4)');
  }
}
