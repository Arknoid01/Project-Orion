/* ===================== DEBUG ORIENTATION WALKERS (temporaire) ===================== */
// Calibrer ISO_DIAGONAL_FACING : bouton 🧭 dans floatingTools.
// mode 'off' | 'force' (même sprite partout) | 'calibrate' (map éditable par diagonale)

const WALKER_DEBUG = {
  mode: 'off',
  forceFacing: 'up',
  forceMirror: false,
  /** @type {Record<string, {facing:string, mirror:boolean}>} */
  isoMap: null,
};

const WALKER_DEBUG_DIAGONALS = ['se', 'sw', 'nw', 'ne'];
const WALKER_DEBUG_FACINGS = ['up', 'down', 'left', 'right'];

function _walkerDebugDefaultIsoMap(){
  const src = typeof ISO_DIAGONAL_FACING !== 'undefined' ? ISO_DIAGONAL_FACING : {};
  const out = {};
  WALKER_DEBUG_DIAGONALS.forEach(d => {
    const e = src[d];
    if (typeof e === 'string') out[d] = { facing: e, mirror: false };
    else if (e) out[d] = { facing: e.facing || 'down', mirror: !!e.mirror };
    else out[d] = { facing: 'down', mirror: false };
  });
  return out;
}

function getWalkerDebugIsoMap(){
  if (!WALKER_DEBUG.isoMap) WALKER_DEBUG.isoMap = _walkerDebugDefaultIsoMap();
  return WALKER_DEBUG.isoMap;
}

function resetWalkerDebugIsoMap(){
  WALKER_DEBUG.isoMap = _walkerDebugDefaultIsoMap();
  _renderWalkerDebugPanel();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}

/** Retourne une orientation forcée ou null (laisser l'auto). */
function getWalkerDebugFacingOverride(isoDiagonal){
  if (WALKER_DEBUG.mode === 'force'){
    return {
      diagonal: isoDiagonal,
      facing: WALKER_DEBUG.forceFacing,
      mirrorX: WALKER_DEBUG.forceMirror,
    };
  }
  if (WALKER_DEBUG.mode === 'calibrate' && isoDiagonal){
    const entry = getWalkerDebugIsoMap()[isoDiagonal];
    if (entry){
      return {
        diagonal: isoDiagonal,
        facing: entry.facing,
        mirrorX: !!entry.mirror,
      };
    }
  }
  return null;
}

function setWalkerDebugMode(mode){
  WALKER_DEBUG.mode = mode;
  _renderWalkerDebugPanel();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}

function setWalkerDebugForce(facing, mirror){
  WALKER_DEBUG.forceFacing = facing;
  WALKER_DEBUG.forceMirror = !!mirror;
  _renderWalkerDebugPanel();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}

function setWalkerDebugCalibrate(diagonal, facing, mirror){
  getWalkerDebugIsoMap()[diagonal] = { facing, mirror: !!mirror };
  _renderWalkerDebugPanel();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}

function toggleWalkerDebugCalibrateMirror(diagonal){
  const m = getWalkerDebugIsoMap();
  if (!m[diagonal]) return;
  m[diagonal].mirror = !m[diagonal].mirror;
  _renderWalkerDebugPanel();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}

function copyWalkerDebugIsoMap(){
  const lines = [
    'const ISO_DIAGONAL_FACING = {',
    ...WALKER_DEBUG_DIAGONALS.map(d => {
      const e = getWalkerDebugIsoMap()[d];
      const mir = e.mirror ? ', mirror: true' : '';
      const comment = { se: 'col+1', sw: 'row+1', nw: 'col−1', ne: 'row−1' }[d] || d;
      return `  ${d}: { facing: '${e.facing}'${mir} }, // ${comment}`;
    }),
    '};',
  ];
  const text = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(
      () => { if (typeof showNotification === 'function') showNotification('Mapping copié dans le presse-papier', 'good'); },
      () => { console.log(text); },
    );
  } else {
    console.log(text);
    if (typeof showNotification === 'function') showNotification('Mapping affiché dans la console (F12)', 'info');
  }
  debugInfo('Walker debug ISO map', text);
}

function toggleWalkerDebugPanel(){
  const panel = document.getElementById('walkerDebugPanel');
  if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) _renderWalkerDebugPanel();
}

function _walkerDebugLabel(d){
  return { se: 'SE (col+1)', sw: 'SW (row+1)', nw: 'NW (col−1) · monte', ne: 'NE (row−1)' }[d] || d;
}

function _renderWalkerDebugPanel(){
  const panel = document.getElementById('walkerDebugPanel');
  if (!panel) return;
  const mode = WALKER_DEBUG.mode;
  const map = getWalkerDebugIsoMap();

  const modeBtns = [
    { id: 'off', label: 'Auto jeu' },
    { id: 'force', label: 'Forcer tous' },
    { id: 'calibrate', label: 'Map custom' },
  ].map(m => `<button type="button" class="walkerDebugModeBtn${mode === m.id ? ' active' : ''}"
    onclick="setWalkerDebugMode('${m.id}')">${m.label}</button>`).join('');

  const facingBtns = WALKER_DEBUG_FACINGS.map(f => {
    const labels = { up: '↑ dos', down: '↓ face', left: '← gauche', right: '→ droite' };
    const on = mode === 'force' && WALKER_DEBUG.forceFacing === f;
    return `<button type="button" class="walkerDebugFaceBtn${on ? ' active' : ''}"
      onclick="setWalkerDebugForce('${f}', WALKER_DEBUG.forceMirror)">${labels[f]}</button>`;
  }).join('');

  const mirrorForce = mode === 'force' && WALKER_DEBUG.forceMirror;
  const calRows = WALKER_DEBUG_DIAGONALS.map(d => {
    const e = map[d];
    const faceRow = WALKER_DEBUG_FACINGS.map(f => {
      const on = mode === 'calibrate' && e.facing === f;
      return `<button type="button" class="walkerDebugMiniBtn${on ? ' active' : ''}"
        onclick="setWalkerDebugCalibrate('${d}', '${f}', ${e.mirror ? 'true' : 'false'})">${f}</button>`;
    }).join('');
    return `<div class="walkerDebugCalRow">
      <span class="walkerDebugCalLabel">${_walkerDebugLabel(d)}</span>
      ${faceRow}
      <button type="button" class="walkerDebugMiniBtn mirror${e.mirror ? ' active' : ''}"
        onclick="toggleWalkerDebugCalibrateMirror('${d}')">⟲</button>
      <span class="walkerDebugCalVal">${e.facing}${e.mirror ? ' +miroir' : ''}</span>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <button class="close" type="button" onclick="toggleWalkerDebugPanel()" title="Fermer">×</button>
    <h3>🧭 Calibrage walkers</h3>
    <p class="walkerDebugHint">Ligne sprite : 0=dos · 1=gauche · 2=face · 3=droite</p>
    <div class="walkerDebugModes">${modeBtns}</div>
    <div class="walkerDebugSection" style="display:${mode === 'force' ? '' : 'none'}">
      <p><b>Forcer la même orientation sur tous les walkers :</b></p>
      <div class="walkerDebugFaces">${facingBtns}</div>
      <button type="button" class="walkerDebugMiniBtn${mirrorForce ? ' active' : ''}"
        onclick="setWalkerDebugForce(WALKER_DEBUG.forceFacing, !WALKER_DEBUG.forceMirror)">Miroir ⟲</button>
    </div>
    <div class="walkerDebugSection" style="display:${mode === 'calibrate' ? '' : 'none'}">
      <p><b>Orientation par direction de marche :</b></p>
      ${calRows}
      <div class="walkerDebugActions">
        <button type="button" class="actionBtn" onclick="copyWalkerDebugIsoMap()">📋 Copier config</button>
        <button type="button" class="actionBtn" onclick="resetWalkerDebugIsoMap()">↺ Reset</button>
      </div>
    </div>`;
}

window.setWalkerDebugMode = setWalkerDebugMode;
window.setWalkerDebugForce = setWalkerDebugForce;
window.setWalkerDebugCalibrate = setWalkerDebugCalibrate;
window.toggleWalkerDebugCalibrateMirror = toggleWalkerDebugCalibrateMirror;
window.copyWalkerDebugIsoMap = copyWalkerDebugIsoMap;
window.resetWalkerDebugIsoMap = resetWalkerDebugIsoMap;
window.toggleWalkerDebugPanel = toggleWalkerDebugPanel;
window.getWalkerDebugFacingOverride = getWalkerDebugFacingOverride;

resetWalkerDebugIsoMap();
