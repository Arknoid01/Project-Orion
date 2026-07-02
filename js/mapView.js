/* ===================== VUE CARTE (style + rotation) ===================== */
// styled = losanges colorés procéduraux (zéro PNG terrain, pas de coutures)
// sprites  = tuiles PNG (tiles_pretes / seamless)

let mapRotationDeg = 0;

function usesStyledTerrain(){
  return typeof MAP_TERRAIN_RENDER === 'string' && MAP_TERRAIN_RENDER === 'styled';
}

function getMapRotationDeg(){
  return mapRotationDeg;
}

function getMapPivotWorld(){
  const a = tileCenter(0, 0);
  const b = tileCenter(GRID_COLS - 1, GRID_ROWS - 1);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function mapRotationRad(){
  return mapRotationDeg * Math.PI / 180;
}

function mapTiltScaleY(){
  if (typeof MAP_TILT_DEG !== 'number' || MAP_TILT_DEG <= 0) return 1;
  return Math.cos(MAP_TILT_DEG * Math.PI / 180);
}

function isMapViewTransformed(){
  return (typeof MAP_ROTATION_ENABLED === 'boolean' && MAP_ROTATION_ENABLED && mapRotationDeg !== 0)
    || mapTiltScaleY() < 0.999;
}

function applyMapViewTransform(c){
  const p = getMapPivotWorld();
  c.translate(p.x, p.y);
  const sy = mapTiltScaleY();
  if (sy < 0.999) c.scale(1, sy);
  if (typeof MAP_ROTATION_ENABLED === 'boolean' && MAP_ROTATION_ENABLED){
    c.rotate(mapRotationRad());
  }
  c.translate(-p.x, -p.y);
}

function clientToMapWorld(clientX, clientY){
  if (typeof isThreeReady === 'function' && isThreeReady()
      && typeof clientToMapWorldThree === 'function'){
    return clientToMapWorldThree(clientX, clientY);
  }
  const base = clientToWorld(clientX, clientY);
  if (!isMapViewTransformed()) return base;

  const p = getMapPivotWorld();
  let dx = base.mx - p.x;
  let dy = base.my - p.y;

  const sy = mapTiltScaleY();
  if (sy > 0.01) dy /= sy;

  if (typeof MAP_ROTATION_ENABLED === 'boolean' && MAP_ROTATION_ENABLED && mapRotationDeg !== 0){
    const rad = -mapRotationRad();
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    dx = rx;
    dy = ry;
  }

  return { mx: p.x + dx, my: p.y + dy };
}

function rotateMapBy(deltaDeg){
  if (!(typeof MAP_ROTATION_ENABLED === 'boolean' && MAP_ROTATION_ENABLED)) return;
  const step = typeof MAP_ROTATION_STEP === 'number' ? MAP_ROTATION_STEP : 15;
  mapRotationDeg = ((mapRotationDeg + deltaDeg * step) % 360 + 360) % 360;
  if (typeof render === 'function') render();
}

function rotateMapLeft(){ rotateMapBy(-1); }
function rotateMapRight(){ rotateMapBy(1); }

function resetMapRotation(){
  mapRotationDeg = 0;
  if (typeof render === 'function') render();
}
