/* ===================== ETAT UI ===================== */
let selectedBuilding = null; // clé de BUILDING_DEFS
let demolishMode = false;
let hoverTile = null;

/* ===================== REGLES DE PLACEMENT ===================== */
function canPlace(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  if (cell.building) return false;
  const def = BUILDING_DEFS[selectedBuilding];
  return cell.terrain === def.validTerrain;
}

/* ===================== PALETTE DE BATIMENTS ===================== */
function buildPalette(){
  const container = document.getElementById('buildingButtons');
  Object.entries(BUILDING_DEFS).forEach(([key, def]) => {
    const btn = document.createElement('button');
    btn.className = 'buildBtn';
    btn.dataset.key = key;
    const reqLabel = t('terrainReq.' + def.validTerrain);
    btn.innerHTML = `<span class="swatch" style="background:${def.color}"></span>
      <span>${def.icon} ${t(def.name)}<small>${reqLabel}</small></span>`;
    btn.addEventListener('click', () => {
      demolishMode = false;
      selectedBuilding = (selectedBuilding === key) ? null : key;
      refreshButtonStates();
      render();
    });
    container.appendChild(btn);
  });
}

function refreshButtonStates(){
  document.querySelectorAll('.buildBtn[data-key]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === selectedBuilding);
  });
  document.getElementById('demolishBtn').classList.toggle('active', demolishMode);
}

/* ===================== INSPECTEUR (stub, Phase 2 le remplira) ===================== */
function renderInspector(col, row){
  // TODO Phase 2 : afficher niveau/population/besoins si la case contient une maison.
  // Pour l'instant le panneau reste sur son texte de placeholder (voir index.html).
}

/* ===================== EVENEMENTS ===================== */
document.getElementById('demolishBtn').addEventListener('click', () => {
  selectedBuilding = null;
  demolishMode = !demolishMode;
  refreshButtonStates();
  render();
});

document.getElementById('resetBtn').addEventListener('click', () => resetGame());

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const { col, row } = screenToTile(mx, my);
  hoverTile = { col, row };

  const info = document.getElementById('infoBar');
  if (inBounds(col, row)){
    const cell = grid[row][col];
    const buildingLabel = cell.building ? t(BUILDING_DEFS[cell.building].name) : t('info.empty');
    info.textContent = t('info.tile', { col, row, terrain: t('terrainName.' + cell.terrain), building: buildingLabel });
  } else {
    info.textContent = t('info.hover');
  }
  render();
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const { col, row } = screenToTile(mx, my);
  if (!inBounds(col, row)) return;

  if (demolishMode){
    if (grid[row][col].building){
      debugInfo(`Démolition : ${t(BUILDING_DEFS[grid[row][col].building].name)}`, { col, row });
    }
    grid[row][col].building = null;
  } else if (selectedBuilding && canPlace(col, row)){
    debugInfo(`Construction : ${t(BUILDING_DEFS[selectedBuilding].name)}`, { col, row });
    grid[row][col].building = selectedBuilding;
  }
  renderInspector(col, row);
  render();
  updateResourceBar();
});
