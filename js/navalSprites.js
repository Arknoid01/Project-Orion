/* ===================== TRIRÈMES VISUELLES (Phase 6) ===================== */
// Sprite statique isométrique ancré sur les cases d'eau adjacentes aux ports.
// 1 navire affiché par trirème de la flotte (jusqu'à NAVAL_MAX_VISIBLE_SHIPS).

const TRIPREME_SPRITE = new Image();
TRIPREME_SPRITE.onload = () => {
  if (typeof measureSpriteFoot === 'function') measureSpriteFoot(TRIPREME_SPRITE);
  if (typeof render === 'function') render();
};
TRIPREME_SPRITE.onerror = () => {
  if (typeof debugWarn === 'function') debugWarn('Sprite trirème introuvable : ' + TRIPREME_SPRITE_PATH);
};
TRIPREME_SPRITE.src = typeof TRIPREME_SPRITE_PATH === 'string' ? TRIPREME_SPRITE_PATH : 'assets/ships/trireme.png';

function _navalShipInView(x, y, bounds){
  if (!bounds) return true;
  const pad = 80;
  return x >= bounds.left - pad && x <= bounds.right + pad
      && y >= bounds.top - pad && y <= bounds.bottom + pad;
}

function collectHarborWaterAnchors(){
  const anchors = [];
  if (typeof isGridReady !== 'function' || !isGridReady()) return anchors;
  if (typeof forEachBuilding !== 'function') return anchors;

  forEachBuilding((type, hCol, hRow) => {
    const def = BUILDING_DEFS[type];
    if (!def || !def.isHarbor) return;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dc, dr], side) => {
      const wc = hCol + dc;
      const wr = hRow + dr;
      if (typeof cellTerrainAt === 'function' && cellTerrainAt(wc, wr) !== 'water') return;
      anchors.push({
        col: wc,
        row: wr,
        harborCol: hCol,
        harborRow: hRow,
        side,
        mirror: dc <= 0,
        sortKey: hCol * 997 + hRow * 31 + side,
      });
    });
  });

  anchors.sort((a, b) => a.sortKey - b.sortKey);
  return anchors;
}

function assignVisibleShipPlacements(anchors, shipCount){
  if (!anchors.length || shipCount <= 0) return [];
  const out = [];
  for (let i = 0; i < shipCount; i++){
    const a = anchors[i % anchors.length];
    const stack = Math.floor(i / anchors.length);
    out.push(Object.assign({}, a, { stack, phase: i * 2.17 }));
  }
  return out;
}

function drawTriremeSprite(x, footY, sprite, targetW, opts){
  opts = opts || {};
  if (typeof drawSpriteOnTile !== 'function') return;
  const bob = opts.bob || 0;
  const offsetX = opts.offsetX || 0;
  const drawOpts = { smooth: true, cyIsFoot: true, lift: bob, offsetX };
  if (!opts.mirror){
    drawSpriteOnTile(x, footY, sprite, targetW, drawOpts);
    return;
  }
  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(-1, 1);
  ctx.translate(-x, 0);
  drawSpriteOnTile(x, footY, sprite, targetW, drawOpts);
  ctx.restore();
}

function drawNavalShips(now, viewBounds){
  if (typeof navalEnabled === 'function' && !navalEnabled()) return;
  if (typeof ensureFleetState === 'function') ensureFleetState();
  if (!fleet || fleet.ships <= 0) return;
  if (typeof countHarbors === 'function' && countHarbors() <= 0) return;

  const img = TRIPREME_SPRITE;
  if (!img.complete || !img.naturalWidth) return;

  const anchors = collectHarborWaterAnchors();
  if (!anchors.length) return;

  const maxVis = typeof NAVAL_MAX_VISIBLE_SHIPS === 'number' ? NAVAL_MAX_VISIBLE_SHIPS : 10;
  const placements = assignVisibleShipPlacements(anchors, Math.min(fleet.ships, maxVis));
  const targetW = typeof SHIP_SPRITE_W === 'number' ? SHIP_SPRITE_W : Math.round(TILE_W * 1.35);
  const t = now || performance.now();

  placements.forEach(p => {
    const { x, y } = tileCenter(p.col, p.row);
    const footY = y + TILE_H * 0.42 + p.stack * 3;
    const bob = Math.sin(t / 900 + p.phase) * 2.5;
    const offsetX = p.stack ? (p.stack % 2 === 0 ? -10 : 10) * Math.min(p.stack, 2) : 0;
    if (!_navalShipInView(x, footY, viewBounds)) return;
    drawTriremeSprite(x, footY, img, targetW, {
      bob,
      offsetX,
      mirror: p.mirror,
    });
  });
}

window.drawNavalShips = drawNavalShips;
