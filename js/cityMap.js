/* ===================== CARTE DE LA CITÉ (minimap carrée) ===================== */
// Vue de dessus simplifiée : terrain, routes, bâtiments, décors, promeneurs.
let cityMapOpen = false;
let cityMapStaticDirty = true;
let cityMapLastTerrainVer = -1;
let cityMapAnimId = 0;
let cityMapStaticCanvas = null;

const CITY_MAP_WALKER_COLORS = {
  water: '#6ec8ff',
  market: '#ffaa55',
  religion: '#ffe566',
  health: '#b8ffff',
  tax: '#ffd966',
  fire: '#ff8844',
};

function invalidateCityMap(){
  cityMapStaticDirty = true;
}
window.invalidateCityMap = invalidateCityMap;

function _cityMapHexRgb(hex){
  const h = (hex || '#888888').replace('#', '');
  const n = parseInt(h.length >= 6 ? h.slice(0, 6) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _cityMapBrightenRgb(rgb, mul, add){
  return [
    Math.min(255, Math.round(rgb[0] * mul + add)),
    Math.min(255, Math.round(rgb[1] * mul + add)),
    Math.min(255, Math.round(rgb[2] * mul + add)),
  ];
}

function _cityMapBuildingStyle(type){
  if (type === 'maison'){
    return { fill: '#f0a860', stroke: '#4a2810', glow: 'rgba(255, 200, 120, 0.55)' };
  }
  const def = BUILDING_DEFS[type];
  const base = def?.color || '#c87830';
  if (def?.isService){
    return { fill: base, stroke: '#fff8e0', glow: 'rgba(255, 230, 140, 0.65)' };
  }
  if (def?.isMonument){
    return { fill: base, stroke: '#ffe566', glow: 'rgba(255, 220, 80, 0.6)' };
  }
  return { fill: base, stroke: '#1a1208', glow: 'rgba(255, 255, 255, 0.25)' };
}

function _cityMapCellDecor(cell, col, row){
  if (!cell) return false;
  if (cell.terrain === 'forest') return true;
  if (typeof cellShowsWheatCrop === 'function' && cellShowsWheatCrop(cell, col, row)) return true;
  if (typeof cellShowsMediterraneanDecor === 'function' && cellShowsMediterraneanDecor(cell, col, row)) return true;
  return false;
}

function _cityMapRebuildStatic(){
  if (!Array.isArray(grid) || !grid.length) return;
  const COLS = grid[0].length;
  const ROWS = grid.length;
  if (!cityMapStaticCanvas){
    cityMapStaticCanvas = document.createElement('canvas');
  }
  const cv = cityMapStaticCanvas;
  if (cv.width !== COLS || cv.height !== ROWS){
    cv.width = COLS;
    cv.height = ROWS;
  }
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(COLS, ROWS);
  const data = img.data;

  for (let r = 0; r < ROWS; r++){
    for (let c = 0; c < COLS; c++){
      const cell = grid[r][c];
      const i = (r * COLS + c) * 4;
      const terrain = cell?.terrain || 'grass';
      let rgb = _cityMapHexRgb(
        (typeof TERRAIN_COLORS !== 'undefined' && TERRAIN_COLORS[terrain])
          ? TERRAIN_COLORS[terrain]
          : '#888888',
      );
      rgb = _cityMapBrightenRgb(rgb, 0.72, -8);
      if (cell?.hasRoad){
        rgb = _cityMapBrightenRgb(_cityMapHexRgb(TERRAIN_COLORS?.road || '#c4a868'), 0.78, -6);
      }
      if (_cityMapCellDecor(cell, c, r)){
        rgb = [Math.min(255, rgb[0] + 12), Math.min(255, rgb[1] + 22), Math.max(0, rgb[2] - 4)];
      }
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  cityMapStaticDirty = false;
  cityMapLastTerrainVer = typeof terrainDataVersion !== 'undefined' ? terrainDataVersion : 0;
}

function _cityMapViewportCells(){
  if (typeof isThreeReady === 'function' && isThreeReady()
      && window._threeTarget && window._threeGridOffset){
    const col = window._threeTarget.x + window._threeGridOffset.offC;
    const row = window._threeTarget.z + window._threeGridOffset.offR;
    const zoom = window._threeZoom || (typeof THREE_ZOOM_BASE !== 'undefined' ? THREE_ZOOM_BASE : 8);
    const base = typeof THREE_ZOOM_BASE !== 'undefined' ? THREE_ZOOM_BASE : 8;
    const rad = Math.max(5, Math.round(12 * base / zoom));
    return {
      colMin: col - rad,
      colMax: col + rad,
      rowMin: row - rad,
      rowMax: row + rad,
    };
  }
  if (typeof camera !== 'undefined' && typeof pickTileAtWorld === 'function'){
    const zoom = typeof zoomLevel !== 'undefined' ? zoomLevel : 1;
    const vw = window.innerWidth / zoom;
    const vh = window.innerHeight / zoom;
    const tl = pickTileAtWorld(camera.x, camera.y);
    const br = pickTileAtWorld(camera.x + vw, camera.y + vh);
    return {
      colMin: Math.min(tl.col, br.col),
      colMax: Math.max(tl.col, br.col),
      rowMin: Math.min(tl.row, br.row),
      rowMax: Math.max(tl.row, br.row),
    };
  }
  return null;
}

function _cityMapDrawBuildings(ctx, cellW, cellH){
  if (!Array.isArray(grid) || !grid.length) return;
  const COLS = grid[0].length;
  const ROWS = grid.length;
  const inset = Math.max(0.4, cellW * 0.06);
  const strokeW = Math.max(1.1, cellW * 0.16);
  const glowPad = Math.max(1.2, cellW * 0.22);

  for (let r = 0; r < ROWS; r++){
    for (let c = 0; c < COLS; c++){
      const cell = grid[r][c];
      if (!cell?.building) continue;
      const fp = (BUILDING_DEFS[cell.building]?.footprint) || 1;
      // Dessiner une seule fois depuis l'ancre (coin NW du footprint)
      if (fp > 1){
        const anchor = (typeof monumentAnchorAt === 'function') ? monumentAnchorAt(c, r) : null;
        if (anchor && (anchor.col !== c || anchor.row !== r)) continue;
      }
      const w = fp * cellW - inset * 2;
      const h = fp * cellH - inset * 2;
      const x = c * cellW + inset;
      const y = r * cellH + inset;
      const style = _cityMapBuildingStyle(cell.building);

      ctx.fillStyle = style.glow;
      ctx.fillRect(x - glowPad, y - glowPad, w + glowPad * 2, h + glowPad * 2);

      ctx.fillStyle = style.fill;
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = strokeW;
      ctx.strokeRect(x + strokeW * 0.5, y + strokeW * 0.5, w - strokeW, h - strokeW);

      if (cell.building === 'maison' || BUILDING_DEFS[cell.building]?.isService){
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const dotR = Math.max(0.8, Math.min(w, h) * 0.14);
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.5, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function _cityMapDrawMarker(ctx, cx, cy, radius, fillColor, emphasis){
  const r = radius;
  const halo = r + Math.max(1.4, r * 0.55);

  ctx.beginPath();
  ctx.arc(cx, cy, halo, 0, Math.PI * 2);
  ctx.fillStyle = emphasis ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.4)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r + Math.max(0.8, r * 0.25), 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0.6, r * 0.38), 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function _cityMapDrawAgents(ctx, cellW, cellH, now){
  function marker(col, row, color, scale, emphasis){
    if (!Number.isFinite(col) || !Number.isFinite(row)) return;
    const radius = Math.max(emphasis ? 2.4 : 1.8, cellW * scale);
    _cityMapDrawMarker(ctx, (col + 0.5) * cellW, (row + 0.5) * cellH, radius, color, emphasis);
  }

  if (Array.isArray(walkers)){
    walkers.forEach(function(w){
      if (!w?.path?.length) return;
      const interp = typeof getWalkerInterp === 'function' ? getWalkerInterp(w, now) : null;
      const col = interp ? interp.col : w.col;
      const row = interp ? interp.row : w.row;
      marker(col, row, CITY_MAP_WALKER_COLORS[w.serviceType] || '#ffd060', 0.52, true);
    });
  }

  if (Array.isArray(migrants)){
    migrants.forEach(function(m){
      marker(m.col, m.row, '#f5e6a8', 0.34, false);
    });
  }

  if (typeof getMilitarySoldiers === 'function'){
    getMilitarySoldiers().forEach(function(s){
      marker(s.col, s.row, '#e85555', 0.34, false);
    });
  }

  if (typeof hero !== 'undefined' && hero){
    marker(hero.col, hero.row, '#ffd700', 0.4, true);
  }
  if (typeof monster !== 'undefined' && monster){
    marker(monster.col, monster.row, '#c060ff', 0.4, true);
  }
  if (Array.isArray(godAgents)){
    godAgents.forEach(function(a){
      marker(a.col, a.row, '#88aaff', 0.3, false);
    });
  }
}

function renderCityMap(now){
  const canvas = document.getElementById('cityMapCanvas');
  if (!canvas || !cityMapOpen || !Array.isArray(grid) || !grid.length) return;

  const COLS = grid[0].length;
  const ROWS = grid.length;
  const ver = typeof terrainDataVersion !== 'undefined' ? terrainDataVersion : 0;
  if (cityMapStaticDirty || ver !== cityMapLastTerrainVer) _cityMapRebuildStatic();
  if (!cityMapStaticCanvas) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || cssW;
  const pxW = Math.max(1, Math.round(cssW * dpr));
  const pxH = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pxW || canvas.height !== pxH){
    canvas.width = pxW;
    canvas.height = pxH;
  }

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, pxW, pxH);
  ctx.fillStyle = '#0a1520';
  ctx.fillRect(0, 0, pxW, pxH);

  const pad = 4 * dpr;
  const mapSize = Math.min(pxW, pxH) - pad * 2;
  const offX = (pxW - mapSize) * 0.5;
  const offY = (pxH - mapSize) * 0.5;
  ctx.drawImage(cityMapStaticCanvas, 0, 0, COLS, ROWS, offX, offY, mapSize, mapSize);

  const cellW = mapSize / COLS;
  const cellH = mapSize / ROWS;
  ctx.save();
  ctx.translate(offX, offY);
  _cityMapDrawBuildings(ctx, cellW, cellH);
  _cityMapDrawAgents(ctx, cellW, cellH, now);

  const vp = _cityMapViewportCells();
  if (vp){
    ctx.strokeStyle = 'rgba(255, 240, 180, 0.95)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(
      vp.colMin * cellW,
      vp.rowMin * cellH,
      (vp.colMax - vp.colMin + 1) * cellW,
      (vp.rowMax - vp.rowMin + 1) * cellH,
    );
  }
  ctx.restore();

  canvas._cityMapLayout = { offX, offY, mapSize, COLS, ROWS, dpr };
}

function _cityMapLoop(now){
  if (!cityMapOpen) return;
  renderCityMap(now);
  cityMapAnimId = requestAnimationFrame(_cityMapLoop);
}

function _cityMapSetOpen(open){
  const panel = document.getElementById('cityMapPanel');
  const btn = document.getElementById('cityMapBtn');
  if (!panel) return;
  cityMapOpen = !!open;
  panel.classList.toggle('open', cityMapOpen);
  if (btn) btn.classList.toggle('active', cityMapOpen);
  if (cityMapOpen){
    invalidateCityMap();
    cancelAnimationFrame(cityMapAnimId);
    cityMapAnimId = requestAnimationFrame(_cityMapLoop);
  } else {
    cancelAnimationFrame(cityMapAnimId);
    cityMapAnimId = 0;
  }
}

function openCityMap(){
  if (!cityMapOpen) _cityMapSetOpen(true);
}
window.openCityMap = openCityMap;

function closeCityMap(){
  if (cityMapOpen) _cityMapSetOpen(false);
}
window.closeCityMap = closeCityMap;

function toggleCityMap(){
  _cityMapSetOpen(!cityMapOpen);
}
window.toggleCityMap = toggleCityMap;

function cityMapClick(evt){
  const canvas = document.getElementById('cityMapCanvas');
  if (!canvas || !canvas._cityMapLayout || !Array.isArray(grid) || !grid.length) return;
  const L = canvas._cityMapLayout;
  const rect = canvas.getBoundingClientRect();
  const x = (evt.clientX - rect.left) * L.dpr;
  const y = (evt.clientY - rect.top) * L.dpr;
  const lx = x - L.offX;
  const ly = y - L.offY;
  if (lx < 0 || ly < 0 || lx > L.mapSize || ly > L.mapSize) return;
  const col = Math.floor((lx / L.mapSize) * L.COLS);
  const row = Math.floor((ly / L.mapSize) * L.ROWS);
  if (!inBounds(col, row)) return;

  if (typeof isThreeReady === 'function' && isThreeReady() && typeof centerThreeOnTile === 'function'){
    centerThreeOnTile(col, row);
  } else if (typeof tileCenter === 'function' && typeof centerCameraOn === 'function'){
    const c = tileCenter(col, row);
    centerCameraOn(c.x, c.y);
  }
  if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}
window.cityMapClick = cityMapClick;

function initCityMap(){
  const canvas = document.getElementById('cityMapCanvas');
  if (canvas) canvas.addEventListener('click', cityMapClick);
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && cityMapOpen){
      e.preventDefault();
      closeCityMap();
    }
  });
}
window.initCityMap = initCityMap;

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initCityMap);
} else {
  initCityMap();
}
