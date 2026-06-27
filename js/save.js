/* ===================== SAUVEGARDE (localStorage) ===================== */
// Clé volontairement spécifique : localStorage est partagé par TOUT le domaine
// github.io, pas seulement ce projet — un nom générique risquerait une collision
// avec un autre des projets hébergés sur arknoid01.github.io.
const SAVE_KEY = 'olympos_save_v1';
const SAVE_VERSION = 1;

function saveGame(opts){
  opts = opts || {};
  const payload = {
    version: SAVE_VERSION,
    grid,
    resources,
    treasury,
    favor,
    taxRate,
    productionMultiplier,
    productionEffectTicksLeft,
    totalWheatProduced,
    victoryAnnounced,
    everHadPopulation,
    defeatAnnounced,
    defeatReason,
    festivalTicksLeft,
    diplomacy,
    tradeExports,
    tradeImports,
    monster,
    hero,
    tickCount: DEBUG.tickCount,
    lang: currentLang,
  };

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    debugInfo(opts.silent ? 'Sauvegarde automatique' : 'Partie sauvegardée');
    if (!opts.silent) showNotification(t('save.saved'), 'good');
  } catch (err) {
    debugError('Échec de la sauvegarde', { error: err.message });
    if (!opts.silent) showNotification(t('save.saveError'), 'bad');
  }
}

// Remplit les champs manquants d'une grille chargée avec des valeurs par défaut
// sûres — utile si une sauvegarde plus ancienne ne contient pas un champ ajouté
// depuis (ex. patrolBlock n'existait pas avant la Phase 3).
function sanitizeGrid(loadedGrid){
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = loadedGrid[row][col] || {};
      loadedGrid[row][col] = {
        terrain: cell.terrain || terrainAt(col, row),
        building: cell.building || null,
        hasRoad: !!cell.hasRoad,
        houseLevel: cell.houseLevel || 0,
        population: cell.population || 0,
        patrolBlock: !!cell.patrolBlock,
        beauty: typeof cell.beauty === 'number' ? cell.beauty : 0,
      };
    }
  }
  return loadedGrid;
}

function loadGame(){
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    debugError('Stockage local inaccessible', { error: err.message });
    return false;
  }
  if (!raw) return false;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    debugError('Sauvegarde corrompue (JSON invalide), ignorée', { error: err.message });
    return false;
  }

  if (!payload || payload.version !== SAVE_VERSION || !Array.isArray(payload.grid)){
    debugWarn('Sauvegarde dans un format inattendu, ignorée');
    return false;
  }
  if (payload.grid.length !== GRID_ROWS || payload.grid.some(row => !Array.isArray(row) || row.length !== GRID_COLS)){
    debugWarn('Dimensions de grille incompatibles dans la sauvegarde, ignorée');
    return false;
  }

  grid = sanitizeGrid(payload.grid);
  // Fusion avec des valeurs par défaut complètes : une sauvegarde plus ancienne
  // n'a pas les nouvelles ressources (huile, vin...) — sans ça elles seraient
  // undefined et casseraient les additions de production (NaN).
  resources = Object.assign(
    { wheat:0, marble:0, sculpture:0, olives:0, oil:0, grapes:0, wine:0, wool:0 },
    payload.resources || {}
  );
  treasury = typeof payload.treasury === 'number' ? payload.treasury : STARTING_TREASURY;
  favor = typeof payload.favor === 'number' ? payload.favor : 50;
  taxRate = typeof payload.taxRate === 'number' ? payload.taxRate : TAX_RATE_DEFAULT;
  productionMultiplier = payload.productionMultiplier || 1;
  productionEffectTicksLeft = payload.productionEffectTicksLeft || 0;
  totalWheatProduced = payload.totalWheatProduced || 0;
  victoryAnnounced = !!payload.victoryAnnounced;
  everHadPopulation = !!payload.everHadPopulation;
  defeatAnnounced = !!payload.defeatAnnounced;
  defeatReason = payload.defeatReason || null;
  festivalTicksLeft = payload.festivalTicksLeft || 0;
  if (payload.diplomacy) diplomacy = payload.diplomacy;
  ensureDiplomacyState(); // complète une sauvegarde antérieure à la diplomatie
  if (payload.tradeExports) tradeExports = payload.tradeExports;
  if (payload.tradeImports) tradeImports = payload.tradeImports;
  ensureTradeState(); // complète une sauvegarde antérieure au commerce extérieur
  monster = payload.monster || null; // créatures transitoires : null par défaut
  hero = payload.hero || null;
  DEBUG.tickCount = payload.tickCount || 0;
  if (payload.lang) currentLang = payload.lang;

  recomputeAllWalkers();
  recomputeLabor();
  debugInfo('Partie chargée depuis la sauvegarde');
  return true;
}

function deleteSave(){
  try {
    localStorage.removeItem(SAVE_KEY);
    debugInfo('Sauvegarde supprimée');
  } catch (err) {
    debugError('Impossible de supprimer la sauvegarde', { error: err.message });
  }
}
