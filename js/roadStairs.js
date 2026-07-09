/* ===================== ESCALIERS DE ROUTE (dénivelé montagne) ===================== */
// Permet de relier deux cases de route voisines dont le niveau diffère de 1
// (ex. plaine → col rocheuse). Pose possible sur roche / marbre interdit aux routes plates.

function stairCellLevel(col, row){
  return typeof cellLevel === 'function' ? cellLevel(col, row) : (grid[row][col].level || 1);
}

function isStairTerrain(terrain){
  return terrain !== 'water';
}

/** Δ niveau effectif entre deux cases (pile Lego ou relief vs plaine). */
function stairLevelDelta(col, row, nc, nr){
  const cell = grid[row][col];
  const n = grid[nr][nc];
  const la = stairCellLevel(col, row);
  const lb = stairCellLevel(nc, nr);
  let d = Math.abs(la - lb);
  if (d === 0 && typeof isElevatedTerrain === 'function'){
    const eA = isElevatedTerrain(cell.terrain);
    const eB = isElevatedTerrain(n.terrain);
    if (eA !== eB) d = 1;
  }
  return d;
}

/** Connexion valide : route en bas + dénivelé ±1, ou route voisine à ±1 niveau. */
function hasStairConnection(col, row){
  const cell = grid[row][col];
  const lv = stairCellLevel(col, row);
  const dirs = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  for (let i = 0; i < dirs.length; i++){
    const c = dirs[i][0];
    const r = dirs[i][1];
    if (!inBounds(c, r)) continue;
    const n = grid[r][c];
    if (!n) continue;
    if (stairLevelDelta(col, row, c, r) !== 1) continue;
    const nlv = stairCellLevel(c, r);
    if (n.hasRoad) return true;
    if (cell.hasRoad && !cell.roadStairs && nlv > lv) return true;
  }
  return false;
}

/** @deprecated alias interne */
function hasStairRoadNeighbor(col, row){
  return hasStairConnection(col, row);
}

function canPlaceStairsTerrain(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  if (cell.building || cell.monumentPart) return false;
  if (!isStairTerrain(cell.terrain)) return false;
  if (cell.roadStairs) return false;
  if (cell.hasRoad && !cell.roadStairs) return hasStairConnection(col, row);
  if (cell.hasRoad) return false;
  return hasStairConnection(col, row);
}

function stairPlacementBlockReason(col, row){
  if (!inBounds(col, row)) return 'stairs.cantPlace';
  const cell = grid[row][col];
  if (cell.building || cell.monumentPart) return 'stairs.cantPlaceBuilding';
  if (!isStairTerrain(cell.terrain)) return 'stairs.cantPlaceWater';
  if (cell.roadStairs) return 'stairs.cantPlace';
  if (!hasStairConnection(col, row)) return 'stairs.cantPlaceNeedLink';
  const cost = typeof STAIR_COST === 'number' ? STAIR_COST : 8;
  if (typeof canAfford === 'function' && !canAfford(cost)) return 'economy.cantAfford';
  return null;
}

function canPlaceStairs(col, row){
  if (!canPlaceStairsTerrain(col, row)) return false;
  const cost = typeof STAIR_COST === 'number' ? STAIR_COST : 8;
  return typeof canAfford === 'function' ? canAfford(cost) : true;
}

function placeStairs(col, row, facing){
  const cell = grid[row][col];
  cell.hasRoad = true;
  cell.roadStairs = true;
  cell.stairFacing = (typeof facing === 'string' && STAIR_FACING_ORDER.includes(facing))
    ? facing
    : (typeof stairPlacementFacing !== 'undefined' ? stairPlacementFacing : stairVisualDir(col, row));
  if (typeof invalidateTerrainLayerCache === 'function'){
    invalidateTerrainLayerCache({ cells: [{ col, row }] });
  }
  if (typeof patchThreeDecors === 'function') patchThreeDecors([{ col, row }]);
  if (typeof invalidatePixiRoads === 'function') invalidatePixiRoads();
}

function rotatePlacedStair(col, row){
  if (!inBounds(col, row)) return null;
  const cell = grid[row][col];
  if (!cell.roadStairs) return null;
  const cur = cell.stairFacing || stairVisualDir(col, row);
  cell.stairFacing = cycleStairFacingFor(cur);
  if (typeof invalidateTerrainLayerCache === 'function'){
    invalidateTerrainLayerCache({ cells: [{ col, row }] });
  }
  if (typeof invalidatePixiRoads === 'function') invalidatePixiRoads();
  if (typeof markRenderDirty === 'function') markRenderDirty();
  return cell.stairFacing;
}

/** Deux cases adjacentes sont connectées pour la patrouille des walkers. */
function roadTileConnects(colA, rowA, colB, rowB){
  if (!inBounds(colA, rowA) || !inBounds(colB, rowB)) return false;
  const a = grid[rowA][colA];
  const b = grid[rowB][colB];
  if (a.patrolBlock || b.patrolBlock) return false;

  const lvA = stairCellLevel(colA, rowA);
  const lvB = stairCellLevel(colB, rowB);
  const diff = Math.abs(lvA - lvB);

  // Bâtiment de service → route voisine (case sans route vers case route).
  if (!a.hasRoad || !b.hasRoad){
    const roadCol = a.hasRoad ? colA : colB;
    const roadRow = a.hasRoad ? rowA : rowB;
    const roadCell = a.hasRoad ? a : b;
    if (!roadCell.hasRoad) return false;
    const lvR = a.hasRoad ? lvA : lvB;
    const lvO = a.hasRoad ? lvB : lvA;
    const d = Math.abs(lvR - lvO);
    if (d === 0) return true;
    if (d === 1 && roadCell.roadStairs) return true;
    return false;
  }

  if (diff === 0) return true;
  if (diff !== 1) return false;
  return !!(a.roadStairs || b.roadStairs);
}

/** Direction visuelle : vers le voisin plus bas (montée depuis cette direction). */
function stairVisualDir(col, row){
  const lv = stairCellLevel(col, row);
  const dirs = [
    [col, row - 1, 'n'],
    [col + 1, row, 'e'],
    [col, row + 1, 's'],
    [col - 1, row, 'w'],
  ];
  for (let i = 0; i < dirs.length; i++){
    const c = dirs[i][0];
    const r = dirs[i][1];
    const d = dirs[i][2];
    if (!inBounds(c, r)) continue;
    const n = grid[r][c];
    if (!n || !n.hasRoad) continue;
    if (stairCellLevel(c, r) < lv) return d;
  }
  for (let j = 0; j < dirs.length; j++){
    const c2 = dirs[j][0];
    const r2 = dirs[j][1];
    const d2 = dirs[j][2];
    if (!inBounds(c2, r2)) continue;
    if (stairCellLevel(c2, r2) > lv) return d2;
  }
  return 's';
}

const STAIR_FACING_ORDER = ['n', 'e', 's', 'w'];
let stairPlacementFacing = 's';

function cycleStairFacingFor(current){
  const order = STAIR_FACING_ORDER;
  const i = order.indexOf(current);
  return order[(i + 1) % order.length];
}

function cycleStairFacing(){
  stairPlacementFacing = cycleStairFacingFor(stairPlacementFacing);
  if (typeof updateStairsBuildInfo === 'function') updateStairsBuildInfo();
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof invalidatePixiRoads === 'function') invalidatePixiRoads();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
  return stairPlacementFacing;
}
window.cycleStairFacing = cycleStairFacing;

function stairFacingLabel(dir){
  const key = 'stairs.facing.' + (dir || 's');
  return (typeof t === 'function') ? t(key) : dir;
}

/** Orientation effective (posée, prévisualisation ou auto). */
function stairEffectiveDir(col, row){
  if (!inBounds(col, row)) return stairPlacementFacing || 's';
  const cell = grid[row][col];
  if (cell.stairFacing && STAIR_FACING_ORDER.includes(cell.stairFacing)) return cell.stairFacing;
  if (typeof stairsMode !== 'undefined' && stairsMode
      && typeof hoverTile !== 'undefined' && hoverTile
      && hoverTile.col === col && hoverTile.row === row){
    return stairPlacementFacing || stairVisualDir(col, row);
  }
  return stairVisualDir(col, row);
}

function stairLevelSpan(col, row){
  let minLv = stairCellLevel(col, row);
  let maxLv = minLv;
  const dirs = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  for (let i = 0; i < dirs.length; i++){
    const c = dirs[i][0];
    const r = dirs[i][1];
    if (!inBounds(c, r)) continue;
    if (stairLevelDelta(col, row, c, r) !== 1) continue;
    const nlv = stairCellLevel(c, r);
    minLv = Math.min(minLv, nlv);
    maxLv = Math.max(maxLv, nlv);
  }
  return { minLv, maxLv };
}

function stairBottomWorldY(col, row){
  const lv = stairCellLevel(col, row);
  let bottomY = (typeof getTerrainSurfaceY === 'function')
    ? getTerrainSurfaceY(col, row)
    : Math.max(0, lv - 1);
  const dirs = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  for (let i = 0; i < dirs.length; i++){
    const c = dirs[i][0];
    const r = dirs[i][1];
    if (!inBounds(c, r)) continue;
    if (stairLevelDelta(col, row, c, r) !== 1) continue;
    const nlv = stairCellLevel(c, r);
    if (nlv < lv && typeof getTerrainSurfaceY === 'function'){
      bottomY = Math.min(bottomY, getTerrainSurfaceY(c, r));
    }
  }
  const extend = (typeof STAIR_FOOT_EXTEND_WORLD === 'number') ? STAIR_FOOT_EXTEND_WORLD : 0;
  return bottomY - extend;
}

function stairTopWorldY(col, row){
  const lv = stairCellLevel(col, row);
  let topY = (typeof getTerrainSurfaceY === 'function')
    ? getTerrainSurfaceY(col, row)
    : Math.max(0, lv - 1);
  const dirs = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  for (let i = 0; i < dirs.length; i++){
    const c = dirs[i][0];
    const r = dirs[i][1];
    if (!inBounds(c, r)) continue;
    if (stairLevelDelta(col, row, c, r) !== 1) continue;
    const nlv = stairCellLevel(c, r);
    if (nlv > lv && typeof getTerrainSurfaceY === 'function'){
      topY = Math.max(topY, getTerrainSurfaceY(c, r));
    }
  }
  return topY;
}

/** @deprecated alias */
function stairBaseWorldY(col, row){
  return stairBottomWorldY(col, row) + ((typeof STAIR_FOOT_EXTEND_WORLD === 'number') ? STAIR_FOOT_EXTEND_WORLD : 0);
}

function stairDrawMetrics(col, row){
  const drawW = typeof STAIR_DRAW_W === 'number' ? STAIR_DRAW_W : TILE_W;
  const { minLv, maxLv } = stairLevelSpan(col, row);

  if (typeof gridToWorld3 === 'function' && typeof worldToScreen === 'function'
      && typeof getTerrainSurfaceY === 'function'){
    const bottomY = stairBottomWorldY(col, row);
    const topY = stairTopWorldY(col, row);
    const wBottom = gridToWorld3(col, row, bottomY);
    const wTop = gridToWorld3(col, row, topY);
    const sBottom = worldToScreen(wBottom.x, wBottom.y, wBottom.z);
    const sTop = worldToScreen(wTop.x, wTop.y, wTop.z);
    const drawH = Math.max(32, sBottom.y - sTop.y);
    return {
      drawW,
      drawH,
      headX: sTop.x,
      headY: sTop.y,
      anchorTop: true,
      useScreenAnchor: true,
    };
  }

  const step = typeof legoBrickStep === 'function' ? legoBrickStep() : TILE_H;
  const footPad = (typeof STAIR_FOOT_PAD_PX === 'number') ? STAIR_FOOT_PAD_PX : 0;
  if (typeof tileTopAtLevel === 'function'){
    const head = tileTopAtLevel(col, row, Math.max(1, maxLv));
    const footTop = tileTopAtLevel(col, row, Math.max(1, minLv));
    const headY = head.y;
    const footY = footTop.y + TILE_H * 0.5 + footPad;
    const drawH = Math.max(32, footY - headY);
    return {
      drawW,
      drawH,
      headX: head.x,
      headY,
      anchorTop: true,
      useScreenAnchor: false,
    };
  }

  return {
    drawW,
    drawH: Math.round(step * Math.max(1, maxLv - minLv + 0.5)),
    headX: null,
    headY: null,
    anchorTop: true,
    useScreenAnchor: false,
  };
}

function drawStairsOverlay(cx, cy, col, row){
  if (typeof drawStairSprite === 'function' && drawStairSprite(ctx, cx, cy, col, row)) return;
  if (typeof ctx === 'undefined' || !ctx) return;
  const dir = stairEffectiveDir(col, row);
  const steps = 4;
  const pad = TILE_W * 0.08;
  ctx.save();
  ctx.strokeStyle = 'rgba(45,38,32,0.55)';
  ctx.lineWidth = 1.2;
  ctx.fillStyle = 'rgba(180,165,140,0.85)';

  for (let i = 0; i < steps; i++){
    const t = (i + 1) / (steps + 1);
    let x0, y0, x1, y1, x2, y2, x3, y3;
    if (dir === 'n'){
      const y = cy - TILE_H * 0.35 * t;
      const w = TILE_W * (0.15 + t * 0.25);
      x0 = cx - w; y0 = y; x1 = cx + w; y1 = y;
      x2 = cx + w * 0.85; y2 = y + 3; x3 = cx - w * 0.85; y3 = y + 3;
    } else if (dir === 's'){
      const y = cy + TILE_H * 0.35 * t;
      const w = TILE_W * (0.15 + t * 0.25);
      x0 = cx - w; y0 = y; x1 = cx + w; y1 = y;
      x2 = cx + w * 0.85; y2 = y - 3; x3 = cx - w * 0.85; y3 = y - 3;
    } else if (dir === 'e'){
      const x = cx + TILE_W * 0.35 * t;
      const h = TILE_H * (0.12 + t * 0.22);
      x0 = x; y0 = cy - h; x1 = x; y1 = cy + h;
      x2 = x - 3; y2 = cy + h * 0.85; x3 = x - 3; y3 = cy - h * 0.85;
    } else {
      const x = cx - TILE_W * 0.35 * t;
      const h = TILE_H * (0.12 + t * 0.22);
      x0 = x; y0 = cy - h; x1 = x; y1 = cy + h;
      x2 = x + 3; y2 = cy + h * 0.85; x3 = x + 3; y3 = cy - h * 0.85;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(214,175,70,0.9)';
  ctx.font = '11px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🪜', cx, cy + TILE_H * 0.05);
  ctx.restore();
}

const STAIR_SPRITE_IMAGES = [];

function initStairSprites(){
  if (!Array.isArray(STAIR_SPRITE_PATHS) || !STAIR_SPRITE_PATHS.length) return;
  STAIR_SPRITE_PATHS.forEach((path, idx) => {
    if (STAIR_SPRITE_IMAGES[idx]) return;
    const img = new Image();
    img.onload = () => {
      if (typeof markRenderDirty === 'function') markRenderDirty();
      if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
      if (typeof invalidatePixiRoads === 'function') invalidatePixiRoads();
    };
    img.onerror = () => {
      if (typeof debugWarn === 'function') debugWarn(`Sprite escalier introuvable : ${path}`);
    };
    img.src = path;
    STAIR_SPRITE_IMAGES[idx] = img;
  });
}

function areStairSpritesReady(){
  const map = (typeof STAIR_VARIANT_BY_DIR === 'object' && STAIR_VARIANT_BY_DIR) || {};
  const needed = new Set(Object.values(map).map(v => v.idx));
  if (!needed.size) return false;
  for (const idx of needed){
    const img = STAIR_SPRITE_IMAGES[idx];
    if (!img || !img.complete || !img.naturalWidth) return false;
  }
  return true;
}

function stairSpriteVariant(col, row){
  const dir = stairEffectiveDir(col, row);
  const tune = getStairTune(dir);
  const map = (typeof STAIR_VARIANT_BY_DIR === 'object' && STAIR_VARIANT_BY_DIR) || {};
  const base = map[dir] || { idx: 0, flipX: false };
  const frontIdx = (typeof tune.idx === 'number') ? tune.idx : base.idx;
  const frontFlipX = (typeof tune.flipX === 'boolean') ? tune.flipX : !!base.flipX;
  const backIdx = (typeof tune.backIdx === 'number') ? tune.backIdx
    : (typeof base.backIdx === 'number' ? base.backIdx : null);
  const backFlipX = (typeof tune.backFlipX === 'boolean') ? tune.backFlipX
    : (typeof base.backFlipX === 'boolean' ? base.backFlipX : frontFlipX);
  return {
    idx: frontIdx,
    flipX: frontFlipX,
    frontIdx,
    frontFlipX,
    backIdx,
    backFlipX,
    tune,
    dir,
  };
}

function stairRenderLayout(col, row, cx, cy){
  const variant = stairSpriteVariant(col, row);
  const tune = variant.tune || getStairTune(variant.dir);
  const metrics = stairDrawMetrics(col, row);
  let headX = (metrics.headX != null) ? metrics.headX : cx;
  let headY = (metrics.headY != null) ? metrics.headY : (cy - metrics.drawH + TILE_H * 0.5);
  let drawW = metrics.drawW * (tune.scaleX || 1);
  let drawH = metrics.drawH * (tune.scaleY || 1);
  headX += tune.offX || 0;
  headY += tune.offY || 0;
  return {
    headX,
    headY,
    drawW,
    drawH,
    flipX: !!variant.frontFlipX,
    idx: variant.frontIdx,
    frontIdx: variant.frontIdx,
    frontFlipX: !!variant.frontFlipX,
    backIdx: variant.backIdx,
    backFlipX: !!variant.backFlipX,
    backOffX: tune.backOffX || 0,
    backOffY: tune.backOffY || 0,
    dir: variant.dir,
    tune,
  };
}

function _applyStairLayoutToCanvas(c, img, layout, isBack){
  const flipX = isBack ? layout.backFlipX : layout.frontFlipX;
  const x = layout.headX + (isBack ? (layout.backOffX || 0) : 0);
  const y = layout.headY + (isBack ? (layout.backOffY || 0) : 0);
  if (flipX){
    c.translate(x, y);
    c.scale(-1, 1);
    c.drawImage(img, -layout.drawW / 2, 0, layout.drawW, layout.drawH);
  } else {
    c.drawImage(img, x - layout.drawW / 2, y, layout.drawW, layout.drawH);
  }
}

function drawStairSprite(targetCtx, cx, cy, col, row){
  if (!areStairSpritesReady()) return false;
  const layout = stairRenderLayout(col, row, cx, cy);
  const c = targetCtx || ctx;
  c.save();
  if (typeof layout.backIdx === 'number'){
    const backImg = STAIR_SPRITE_IMAGES[layout.backIdx];
    if (backImg && backImg.complete && backImg.naturalWidth){
      _applyStairLayoutToCanvas(c, backImg, layout, true);
    }
  }
  const frontImg = STAIR_SPRITE_IMAGES[layout.frontIdx];
  if (!frontImg || !frontImg.complete || !frontImg.naturalWidth){
    c.restore();
    return false;
  }
  _applyStairLayoutToCanvas(c, frontImg, layout, false);
  c.restore();
  return true;
}

const STAIR_TUNE_STORAGE_KEY = 'olympos_stair_tune_v1';
let _stairTuneCache = null;

function stairTuneDefaults(){
  return (typeof STAIR_TUNE_DEFAULT === 'object' && STAIR_TUNE_DEFAULT)
    ? JSON.parse(JSON.stringify(STAIR_TUNE_DEFAULT))
    : {
      n: { idx: 0, flipX: false, backIdx: 2, backFlipX: false, scaleX: 1.2, scaleY: 1.85, offX: -2, offY: -42, backOffX: 0, backOffY: 0 },
      e: { idx: 3, flipX: false, backIdx: 9, backFlipX: false, scaleX: 1.2, scaleY: 1.85, offX: -2, offY: -42, backOffX: 0, backOffY: 0 },
      s: { idx: 0, flipX: true, backIdx: 2, backFlipX: true, scaleX: 1.2, scaleY: 1.85, offX: -2, offY: -42, backOffX: 0, backOffY: 0 },
      w: { idx: 3, flipX: true, backIdx: 9, backFlipX: true, scaleX: 1.2, scaleY: 1.85, offX: -2, offY: -42, backOffX: 0, backOffY: 0 },
    };
}

function loadStairTune(){
  return stairTuneDefaults();
}

function saveStairTune(){
  /* réglages figés dans config.js (STAIR_TUNE_DEFAULT) */
}

function getStairTune(dir){
  if (!_stairTuneCache) _stairTuneCache = loadStairTune();
  const d = STAIR_FACING_ORDER.includes(dir) ? dir : 's';
  return { ...stairTuneDefaults()[d], ..._stairTuneCache[d] };
}

function setStairTune(dir, patch){
  if (!_stairTuneCache) _stairTuneCache = loadStairTune();
  const d = STAIR_FACING_ORDER.includes(dir) ? dir : 's';
  _stairTuneCache[d] = { ...getStairTune(d), ...patch };
  saveStairTune();
  stairTuneChanged();
}

function nudgeStairTune(dir, key, delta){
  const tune = getStairTune(dir);
  if (key === 'scaleX' || key === 'scaleY'){
    setStairTune(dir, { [key]: Math.max(0.2, Math.min(3, (tune[key] || 1) + delta)) });
    return;
  }
  if (key === 'offX' || key === 'offY'){
    setStairTune(dir, { [key]: (tune[key] || 0) + delta });
    return;
  }
}

function cycleStairTuneIdx(dir){
  const tune = getStairTune(dir);
  const list = (typeof STAIR_TUNE_IDX_CYCLE !== 'undefined' && STAIR_TUNE_IDX_CYCLE.length)
    ? STAIR_TUNE_IDX_CYCLE
    : [0, 3, 6, 9];
  const i = list.indexOf(tune.idx);
  const next = list[(i + 1) % list.length];
  setStairTune(dir, { idx: next });
  return next;
}

function toggleStairTuneFlip(dir){
  const tune = getStairTune(dir);
  setStairTune(dir, { flipX: !tune.flipX });
}

function resetStairTune(dir){
  if (!_stairTuneCache) _stairTuneCache = loadStairTune();
  if (dir && STAIR_FACING_ORDER.includes(dir)){
    _stairTuneCache[dir] = { ...stairTuneDefaults()[dir] };
  } else {
    _stairTuneCache = stairTuneDefaults();
  }
  saveStairTune();
  stairTuneChanged();
}

function stairTuneSummary(dir){
  const tune = getStairTune(dir);
  return `idx=${tune.idx} flipX=${tune.flipX} scale=${tune.scaleX.toFixed(2)}×${tune.scaleY.toFixed(2)} off=${tune.offX},${tune.offY}`;
}

function stairTuneExportJson(){
  const payload = {};
  STAIR_FACING_ORDER.forEach(face => { payload[face] = getStairTune(face); });
  return JSON.stringify(payload, null, 2);
}

function _copyTextFallback(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

function copyStairTuneToConsole(dir){
  const json = stairTuneExportJson();
  try {
    console.groupCollapsed('[StairTune] Réglages escalier');
    console.log(json);
    console.groupEnd();
  } catch { /* ignore */ }
  if (typeof debugInfo === 'function') debugInfo('StairTune JSON export', json);

  const notify = (copied) => {
    const msg = (typeof t === 'function')
      ? t(copied ? 'stairs.debugCopiedClipboard' : 'stairs.debugCopiedConsole')
      : (copied ? 'JSON copié dans le presse-papiers' : 'JSON dans la console (F12)');
    if (typeof showNotification === 'function') showNotification(msg, copied ? 'good' : 'info');
  };

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function'){
    navigator.clipboard.writeText(json)
      .then(() => notify(true))
      .catch(() => notify(_copyTextFallback(json)));
    return;
  }
  notify(_copyTextFallback(json));
}

function stairTuneChanged(){
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof invalidatePixiRoads === 'function') invalidatePixiRoads();
  if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
  if (typeof updateStairsBuildInfo === 'function') updateStairsBuildInfo();
}

window.getStairTune = getStairTune;
window.setStairTune = setStairTune;
window.nudgeStairTune = nudgeStairTune;
window.cycleStairTuneIdx = cycleStairTuneIdx;
window.toggleStairTuneFlip = toggleStairTuneFlip;
window.resetStairTune = resetStairTune;
window.copyStairTuneToConsole = copyStairTuneToConsole;
window.stairRenderLayout = stairRenderLayout;
_stairTuneCache = loadStairTune();
initStairSprites();
