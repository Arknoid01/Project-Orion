/* ===================== DEBUG CALAGE SPRITES BÂTIMENTS ===================== */
// Panneau 📐 : décalage global + par bâtiment, aperçu sur case cliquée, copie config.js

const BUILDING_SPRITE_DEBUG = {
  panelOpen: false,
  selectedType: 'garden',
  previewCol: null,
  previewRow: null,
  global: { offsetX: 0, offsetY: 0 },
  /** @type {Record<string, {offsetX?:number, offsetY?:number, spriteScale?:number}>} */
  overrides: {},
};

const BUILDING_SPRITE_DEBUG_STORAGE = 'olympos_building_sprite_debug_v1';

function _buildingSpriteDebugTypes(){
  if (typeof BUILDING_DEFS === 'undefined') return [];
  return Object.keys(BUILDING_DEFS).filter(k => {
    const d = BUILDING_DEFS[k];
    if (!d || d.isMonument) return false;
    return !!d.sprite || d.isDecoration || d.isHouse;
  }).sort();
}

function _buildingSpriteDebugBase(def){
  def = def || {};
  return {
    offsetX: typeof def.spriteOffsetX === 'number' ? def.spriteOffsetX : 0,
    offsetY: typeof def.spriteOffsetY === 'number' ? def.spriteOffsetY : 0,
    spriteScale: def.spriteScale != null ? def.spriteScale : null,
  };
}

function getBuildingSpritePlacement(typeKey, def){
  def = def || (typeof BUILDING_DEFS !== 'undefined' ? BUILDING_DEFS[typeKey] : null) || {};
  const base = _buildingSpriteDebugBase(def);
  const g = BUILDING_SPRITE_DEBUG.global || {};
  const o = BUILDING_SPRITE_DEBUG.overrides[typeKey] || {};

  const configX = o.offsetX != null ? o.offsetX : base.offsetX;
  const configY = o.offsetY != null ? o.offsetY : base.offsetY;
  const spriteScale = o.spriteScale != null ? o.spriteScale : base.spriteScale;

  return {
    offsetX: configX + (g.offsetX || 0),
    offsetY: configY + (g.offsetY || 0),
    spriteScale,
    configX,
    configY,
  };
}

function _buildingSpriteDebugPersist(){
  try{
    localStorage.setItem(BUILDING_SPRITE_DEBUG_STORAGE, JSON.stringify({
      global: BUILDING_SPRITE_DEBUG.global,
      overrides: BUILDING_SPRITE_DEBUG.overrides,
      selectedType: BUILDING_SPRITE_DEBUG.selectedType,
    }));
  } catch (e){ /* ignore */ }
}

function _buildingSpriteDebugLoad(){
  try{
    const raw = localStorage.getItem(BUILDING_SPRITE_DEBUG_STORAGE);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.global) BUILDING_SPRITE_DEBUG.global = data.global;
    if (data.overrides) BUILDING_SPRITE_DEBUG.overrides = data.overrides;
    if (data.selectedType) BUILDING_SPRITE_DEBUG.selectedType = data.selectedType;
  } catch (e){ /* ignore */ }
}

function _buildingSpriteDebugDirty(){
  if (typeof invalidatePixiBuildings === 'function') invalidatePixiBuildings();
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof render === 'function') render();
}

function setBuildingSpriteDebugGlobal(key, value){
  BUILDING_SPRITE_DEBUG.global[key] = value;
  _buildingSpriteDebugPersist();
  _renderBuildingSpriteDebugPanel();
  _buildingSpriteDebugDirty();
}

function setBuildingSpriteDebugOverride(typeKey, key, value){
  if (!BUILDING_SPRITE_DEBUG.overrides[typeKey]) BUILDING_SPRITE_DEBUG.overrides[typeKey] = {};
  if (value === '' || value == null || Number.isNaN(value)){
    delete BUILDING_SPRITE_DEBUG.overrides[typeKey][key];
    if (!Object.keys(BUILDING_SPRITE_DEBUG.overrides[typeKey]).length){
      delete BUILDING_SPRITE_DEBUG.overrides[typeKey];
    }
  } else {
    BUILDING_SPRITE_DEBUG.overrides[typeKey][key] = value;
  }
  _buildingSpriteDebugPersist();
  _renderBuildingSpriteDebugPanel();
  _buildingSpriteDebugDirty();
}

function selectBuildingSpriteDebugType(typeKey){
  BUILDING_SPRITE_DEBUG.selectedType = typeKey;
  _buildingSpriteDebugPersist();
  _renderBuildingSpriteDebugPanel();
  _buildingSpriteDebugDirty();
}

function resetBuildingSpriteDebugOverride(typeKey){
  delete BUILDING_SPRITE_DEBUG.overrides[typeKey];
  _buildingSpriteDebugPersist();
  _renderBuildingSpriteDebugPanel();
  _buildingSpriteDebugDirty();
}

function resetBuildingSpriteDebugAll(){
  BUILDING_SPRITE_DEBUG.global = { offsetX: 0, offsetY: 0 };
  BUILDING_SPRITE_DEBUG.overrides = {};
  _buildingSpriteDebugPersist();
  _renderBuildingSpriteDebugPanel();
  _buildingSpriteDebugDirty();
}

function applyBuildingSpriteDebugGlobalToAll(){
  const gx = BUILDING_SPRITE_DEBUG.global.offsetX || 0;
  const gy = BUILDING_SPRITE_DEBUG.global.offsetY || 0;
  if (!gx && !gy) return;
  _buildingSpriteDebugTypes().forEach(typeKey => {
    const def = BUILDING_DEFS[typeKey];
    const base = _buildingSpriteDebugBase(def);
    const cur = BUILDING_SPRITE_DEBUG.overrides[typeKey] || {};
    const curX = cur.offsetX != null ? cur.offsetX : base.offsetX;
    const curY = cur.offsetY != null ? cur.offsetY : base.offsetY;
    BUILDING_SPRITE_DEBUG.overrides[typeKey] = Object.assign({}, cur, {
      offsetX: curX + gx,
      offsetY: curY + gy,
    });
  });
  BUILDING_SPRITE_DEBUG.global = { offsetX: 0, offsetY: 0 };
  _buildingSpriteDebugPersist();
  _renderBuildingSpriteDebugPanel();
  _buildingSpriteDebugDirty();
  if (typeof showNotification === 'function'){
    showNotification('Décalage global appliqué à tous les bâtiments (config)', 'good');
  }
}

function handleBuildingSpriteDebugClick(col, row){
  if (!BUILDING_SPRITE_DEBUG.panelOpen) return false;
  BUILDING_SPRITE_DEBUG.previewCol = col;
  BUILDING_SPRITE_DEBUG.previewRow = row;
  if (typeof isGridReady === 'function' && isGridReady()){
    const cell = grid[row][col];
    if (cell && cell.building && cell.building !== 'maison'){
      BUILDING_SPRITE_DEBUG.selectedType = cell.building;
    }
  }
  _renderBuildingSpriteDebugPanel();
  _buildingSpriteDebugDirty();
  return true;
}

function _buildingSpriteDebugCopyText(text){
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(
      () => { if (typeof showNotification === 'function') showNotification('Copié dans le presse-papier', 'good'); },
      () => { console.log(text); },
    );
  } else {
    console.log(text);
    if (typeof showNotification === 'function') showNotification('Config affichée dans la console (F12)', 'info');
  }
  if (typeof debugInfo === 'function') debugInfo('Building sprite debug', text);
}

function copyBuildingSpriteDebugOne(){
  const typeKey = BUILDING_SPRITE_DEBUG.selectedType;
  const def = BUILDING_DEFS[typeKey];
  if (!def) return;
  const p = getBuildingSpritePlacement(typeKey, def);
  const base = _buildingSpriteDebugBase(def);
  const lines = [`// config.js — ${typeKey}`];
  if (p.configX !== base.offsetX) lines.push(`spriteOffsetX: ${p.configX},`);
  if (p.configY !== base.offsetY) lines.push(`spriteOffsetY: ${p.configY},`);
  if (p.spriteScale != null && p.spriteScale !== base.spriteScale) lines.push(`spriteScale: ${p.spriteScale},`);
  if (lines.length === 1){
    lines.push('// (identique aux valeurs par défaut — rien à coller)');
  }
  _buildingSpriteDebugCopyText(lines.join('\n'));
}

function copyBuildingSpriteDebugPatch(){
  const lines = ['// Patch BUILDING_DEFS — calibrage sprites'];
  _buildingSpriteDebugTypes().forEach(typeKey => {
    const def = BUILDING_DEFS[typeKey];
    const p = getBuildingSpritePlacement(typeKey, def);
    const base = _buildingSpriteDebugBase(def);
    const parts = [];
    if (p.configX !== base.offsetX) parts.push(`spriteOffsetX: ${p.configX}`);
    if (p.configY !== base.offsetY) parts.push(`spriteOffsetY: ${p.configY}`);
    if (p.spriteScale != null && p.spriteScale !== base.spriteScale) parts.push(`spriteScale: ${p.spriteScale}`);
    if (parts.length) lines.push(`  ${typeKey}: { ${parts.join(', ')} },`);
  });
  if (lines.length === 1) lines.push('// (aucun override)');
  _buildingSpriteDebugCopyText(lines.join('\n'));
}

function _bsdSlider(id, label, value, min, max, step, oninput){
  return `<label class="bsdRow"><span>${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"
      oninput="${oninput}(+this.value)"> <code>${value}</code></label>`;
}

function _renderBuildingSpriteDebugPanel(){
  const panel = document.getElementById('buildingSpriteDebugPanel');
  if (!panel) return;

  const types = _buildingSpriteDebugTypes();
  const sel = BUILDING_SPRITE_DEBUG.selectedType;
  if (!types.includes(sel) && types.length) BUILDING_SPRITE_DEBUG.selectedType = types[0];

  const typeKey = BUILDING_SPRITE_DEBUG.selectedType;
  const def = BUILDING_DEFS[typeKey] || {};
  const base = _buildingSpriteDebugBase(def);
  const o = BUILDING_SPRITE_DEBUG.overrides[typeKey] || {};
  const curX = o.offsetX != null ? o.offsetX : base.offsetX;
  const curY = o.offsetY != null ? o.offsetY : base.offsetY;
  const curScale = o.spriteScale != null ? o.spriteScale : (base.spriteScale != null ? base.spriteScale : '');
  const eff = getBuildingSpritePlacement(typeKey, def);
  const g = BUILDING_SPRITE_DEBUG.global;

  const options = types.map(k => {
    const d = BUILDING_DEFS[k];
    const icon = d && d.icon ? d.icon : '🏛️';
    return `<option value="${k}"${k === typeKey ? ' selected' : ''}>${icon} ${k}</option>`;
  }).join('');

  const preview = (BUILDING_SPRITE_DEBUG.previewCol != null)
    ? `(${BUILDING_SPRITE_DEBUG.previewCol}, ${BUILDING_SPRITE_DEBUG.previewRow})`
    : '— cliquez une case —';

  panel.innerHTML = `
    <button class="close" type="button" onclick="toggleBuildingSpriteDebugPanel()" title="Fermer">×</button>
    <h3>📐 Calage bâtiments</h3>
    <p class="bsdHint">Cliquez une case pour l'aperçu. Les valeurs « config » vont dans <code>config.js</code> ; le décalage global est temporaire (aperçu).</p>

    <p class="bsdSectionTitle">Global (aperçu live)</p>
    ${_bsdSlider('gX', 'offsetX', g.offsetX || 0, -80, 80, 1, 'setBuildingSpriteDebugGlobalX')}
    ${_bsdSlider('gY', 'offsetY', g.offsetY || 0, -40, 40, 1, 'setBuildingSpriteDebugGlobalY')}
    <button type="button" class="actionBtn" onclick="applyBuildingSpriteDebugGlobalToAll()">⬅ Appliquer global → config de tous</button>

    <p class="bsdSectionTitle">Bâtiment</p>
    <select class="bsdSelect" onchange="selectBuildingSpriteDebugType(this.value)">${options}</select>
    <p class="bsdMeta">Aperçu case : <b>${preview}</b><br>
      Effectif écran : X=${eff.offsetX} Y=${eff.offsetY}${eff.spriteScale != null ? ` · scale=${eff.spriteScale}` : ''}</p>

    ${_bsdSlider('x', 'spriteOffsetX', curX, -80, 80, 1, 'setBuildingSpriteDebugCurX')}
    ${_bsdSlider('y', 'spriteOffsetY', curY, -40, 40, 1, 'setBuildingSpriteDebugCurY')}
    <label class="bsdRow"><span>spriteScale</span>
      <input type="number" min="60" max="220" step="1" value="${curScale}"
        placeholder="auto (${typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 128})"
        onchange="setBuildingSpriteDebugCurScale(this.value === '' ? null : +this.value)">
    </label>

    <div class="bsdActions">
      <button type="button" class="actionBtn" onclick="copyBuildingSpriteDebugOne()">📋 Copier ce bâtiment</button>
      <button type="button" class="actionBtn" onclick="copyBuildingSpriteDebugPatch()">📋 Copier tout le patch</button>
      <button type="button" class="actionBtn" onclick="resetBuildingSpriteDebugOverride('${typeKey}')">↺ Reset bâtiment</button>
      <button type="button" class="actionBtn" onclick="resetBuildingSpriteDebugAll()">↺ Tout reset</button>
    </div>`;
}

function setBuildingSpriteDebugGlobalX(v){ setBuildingSpriteDebugGlobal('offsetX', v); }
function setBuildingSpriteDebugGlobalY(v){ setBuildingSpriteDebugGlobal('offsetY', v); }
function setBuildingSpriteDebugCurX(v){ setBuildingSpriteDebugOverride(BUILDING_SPRITE_DEBUG.selectedType, 'offsetX', v); }
function setBuildingSpriteDebugCurY(v){ setBuildingSpriteDebugOverride(BUILDING_SPRITE_DEBUG.selectedType, 'offsetY', v); }
function setBuildingSpriteDebugCurScale(v){
  setBuildingSpriteDebugOverride(BUILDING_SPRITE_DEBUG.selectedType, 'spriteScale', v);
}

function toggleBuildingSpriteDebugPanel(){
  const panel = document.getElementById('buildingSpriteDebugPanel');
  if (!panel) return;
  const wasOpen = panel.classList.contains('open');
  if (typeof togglePanel === 'function') togglePanel('buildingSpriteDebugPanel');
  else panel.classList.toggle('open');
  BUILDING_SPRITE_DEBUG.panelOpen = panel.classList.contains('open');
  if (!wasOpen && BUILDING_SPRITE_DEBUG.panelOpen){
    _renderBuildingSpriteDebugPanel();
    if (BUILDING_SPRITE_DEBUG.previewCol == null && typeof GRID_COLS !== 'undefined'){
      BUILDING_SPRITE_DEBUG.previewCol = Math.floor(GRID_COLS / 2);
      BUILDING_SPRITE_DEBUG.previewRow = Math.floor((typeof GRID_ROWS !== 'undefined' ? GRID_ROWS : 14) / 2);
    }
    _buildingSpriteDebugDirty();
  } else if (!BUILDING_SPRITE_DEBUG.panelOpen){
    _buildingSpriteDebugDirty();
  }
}

/** Aperçu Pixi sur la case choisie (contour + sprite fantôme). */
function updateBuildingSpriteDebugPreview(){
  const container = window._buildingDebugPreviewContainer;
  if (!container) return;
  container.removeChildren();
  if (!BUILDING_SPRITE_DEBUG.panelOpen) return;

  const col = BUILDING_SPRITE_DEBUG.previewCol;
  const row = BUILDING_SPRITE_DEBUG.previewRow;
  if (col == null || row == null) return;
  if (typeof inBounds === 'function' && !inBounds(col, row)) return;

  const typeKey = BUILDING_SPRITE_DEBUG.selectedType;
  const def = BUILDING_DEFS[typeKey];
  if (!def) return;

  if (typeof getTileScreenDiamond === 'function'){
    const d = getTileScreenDiamond(col, row);
    const g = new PIXI.Graphics();
    g.moveTo(d.north.x, d.north.y);
    g.lineTo(d.east.x, d.east.y);
    g.lineTo(d.south.x, d.south.y);
    g.lineTo(d.west.x, d.west.y);
    g.closePath();
    g.stroke({ color: 0xffcc44, width: 2, alpha: 0.9 });
    container.addChild(g);
  }

  const isHouse = typeKey === 'maison' || def.isHouse;
  const houseLevel = isHouse && typeof grid !== 'undefined' && grid[row] ? (grid[row][col].houseLevel || 3) : 3;
  const houseKey = isHouse && typeof houseSpriteKeyForLevel === 'function'
    ? houseSpriteKeyForLevel(houseLevel) : 'villa';
  const texKey = isHouse ? ('house_' + houseKey) : typeKey;
  const tex = window._buildingTextures && (window._buildingTextures[texKey] || window._buildingTextures[typeKey]);
  let img = null;
  if (isHouse && typeof window.HOUSE_SPRITE_IMAGES !== 'undefined'){
    img = window.HOUSE_SPRITE_IMAGES[houseKey];
  } else if (typeof window.BUILDING_SPRITE_IMAGES !== 'undefined'){
    img = window.BUILDING_SPRITE_IMAGES[typeKey];
  }

  if (!tex && !img) return;

  const placement = getBuildingSpritePlacement(typeKey, def);
  const drawW = typeof buildingDrawWidthForDef === 'function'
    ? buildingDrawWidthForDef(def, img, typeKey)
    : (typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 128);

  if (typeof spritePlacementOnTileScreen === 'function' && (tex || img)){
    const pl = spritePlacementOnTileScreen(col, row, img || { naturalWidth: tex.width, width: tex.width }, drawW, {
      building: true,
      offsetX: placement.offsetX,
      lift: placement.offsetY,
    });
    if (pl && tex){
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(pl.footNx, pl.footNy);
      spr.scale.set(pl.scale);
      spr.x = pl.x;
      spr.y = pl.y;
      spr.alpha = 0.92;
      container.addChild(spr);
    }
  }
}

window.getBuildingSpritePlacement = getBuildingSpritePlacement;
window.handleBuildingSpriteDebugClick = handleBuildingSpriteDebugClick;
window.toggleBuildingSpriteDebugPanel = toggleBuildingSpriteDebugPanel;
window.updateBuildingSpriteDebugPreview = updateBuildingSpriteDebugPreview;
window.setBuildingSpriteDebugGlobalX = setBuildingSpriteDebugGlobalX;
window.setBuildingSpriteDebugGlobalY = setBuildingSpriteDebugGlobalY;
window.setBuildingSpriteDebugCurX = setBuildingSpriteDebugCurX;
window.setBuildingSpriteDebugCurY = setBuildingSpriteDebugCurY;
window.setBuildingSpriteDebugCurScale = setBuildingSpriteDebugCurScale;
window.selectBuildingSpriteDebugType = selectBuildingSpriteDebugType;
window.applyBuildingSpriteDebugGlobalToAll = applyBuildingSpriteDebugGlobalToAll;
window.copyBuildingSpriteDebugOne = copyBuildingSpriteDebugOne;
window.copyBuildingSpriteDebugPatch = copyBuildingSpriteDebugPatch;
window.resetBuildingSpriteDebugOverride = resetBuildingSpriteDebugOverride;
window.resetBuildingSpriteDebugAll = resetBuildingSpriteDebugAll;

_buildingSpriteDebugLoad();

(function hookBuildingSpriteDebugClose(){
  function tryHook(){
    if (typeof window.closePanels !== 'function' || window.closePanels._bsdHooked) return;
    const orig = window.closePanels;
    window.closePanels = function(){
      BUILDING_SPRITE_DEBUG.panelOpen = false;
      if (typeof updateBuildingSpriteDebugPreview === 'function') updateBuildingSpriteDebugPreview();
      return orig.apply(this, arguments);
    };
    window.closePanels._bsdHooked = true;
  }
  tryHook();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryHook);
  else setTimeout(tryHook, 0);
})();
