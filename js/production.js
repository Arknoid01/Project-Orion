/* ===================== ETAT RESSOURCES ===================== */
const DEFAULT_RESOURCES = {
  wheat:0, carrots:0, meat:0, marble:0, sculpture:0, olives:0, oil:0, grapes:0, wine:0, wool:0,
  clothing:0, fish:0, coal:0, bronze:0, arms:0,
};

function mergeResources(stored){
  return Object.assign({}, DEFAULT_RESOURCES, stored || {});
}

let resources = mergeResources(typeof STARTING_RESOURCES !== 'undefined' ? STARTING_RESOURCES : {});

function runTransformBuilding(def, caps){
  if (!def.consumes || !def.produces) return;
  const factor = industryFactor(def.produces);
  if (factor <= 0) return;
  for (const [resName, amount] of Object.entries(def.consumes)){
    if ((resources[resName] || 0) < amount * factor) return;
  }
  for (const [resName, amount] of Object.entries(def.consumes)){
    resources[resName] -= amount * factor;
  }
  const cap = caps[def.produces];
  resources[def.produces] = Math.min(cap != null ? cap : Infinity, (resources[def.produces] || 0) + def.rate * factor);
}

/* ===================== PRODUCTION (TICK) ===================== */
function computeCaps(){
  const caps = { ...BASE_CAP };
  forEachBuilding((type) => {
    const def = BUILDING_DEFS[type];
    if (def.storageBonus){
      for (const res in def.storageBonus){
        caps[res] = (caps[res] || 0) + def.storageBonus[res];
      }
    }
  });
  return caps;
}

function forEachBuilding(callback){
  if (!isGridReady()) return;
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const b = grid[row][col].building;
      if (b) callback(b, col, row);
    }
  }
}

function industryFactor(resource){
  const godMult = (typeof prodGodMultiplier === 'function') ? prodGodMultiplier(resource) : 1;
  return productionMultiplier * employment.ratio * taxEfficiencyMultiplier() * godMult;
}

function tick(){
  if (typeof isGamePaused === 'function' && isGamePaused()) return;
  if (typeof defeatAnnounced !== 'undefined' && defeatAnnounced) return;
  if (!grid || !grid.length) return;
  DEBUG.tickCount++;
  lastTickTimestamp = performance.now();

  // Chaque sous-système est isolé : une exception (militaire, dieux, créatures…) est
  // journalisée et ignorée pour CE tick, sans jamais geler toute la simulation
  // (sinon les walkers se figent et oscillent — cf. bug « gel pendant une attaque »).
  const _safe = (label, fn) => {
    try { fn(); }
    catch (err){
      console.error('[tick] Exception dans « ' + label + ' » — sous-système ignoré ce tick :', err);
      if (typeof debugWarn === 'function'){
        debugWarn('Exception tick (' + label + ') : ' + ((err && err.message) ? err.message : String(err)));
      }
    }
  };

  _safe('mythology', () => tickMythology());
  _safe('monumentBenefits', () => { if (typeof tickMonumentBenefits === 'function') tickMonumentBenefits(); });
  _safe('adventures', () => { if (typeof tickAdventures === 'function') tickAdventures(); });

  // Économie : taxes encaissées, entretien payé, puis main-d'œuvre recalculée
  // (l'industrie produit ensuite au prorata du ratio d'emploi).
  _safe('economy', () => { collectTaxes(); payUpkeep(); recomputeLabor(); });

  let caps = {};
  _safe('caps', () => { caps = computeCaps(); });

  // production simple (ferme, carrière, verger…)
  _safe('production', () => {
    forEachBuilding((type) => {
      const def = BUILDING_DEFS[type];
      if (def.produces && !def.consumes && !def.isSeasonalCrop){
        const factor = industryFactor(def.produces);
        const before = resources[def.produces];
        resources[def.produces] = Math.min(caps[def.produces], resources[def.produces] + def.rate * factor);
        const added = resources[def.produces] - before;
        if (def.produces === 'wheat') totalWheatProduced += added;
        if (before < caps[def.produces] && resources[def.produces] >= caps[def.produces]){
          debugWarn(`Stock saturé : ${def.produces} a atteint son plafond (${caps[def.produces]})`);
        }
      }
    });
  });

  // ateliers de transformation (mono ou multi-ingrédients)
  _safe('transform', () => {
    forEachBuilding((type) => {
      runTransformBuilding(BUILDING_DEFS[type], caps);
    });
  });

  _safe('invariants', () => debugCheckInvariants());
  _safe('markets', () => processMarkets());
  _safe('beauty', () => recomputeBeauty());
  _safe('houses', () => evaluateHouses());
  _safe('maintenance', () => checkMaintenanceRisks());
  _safe('walkers', () => advanceWalkers());
  _safe('objectives', () => checkObjectives());
  _safe('defeat', () => checkDefeat());
  _safe('festival', () => tickFestival());
  _safe('venues', () => { if (typeof tickVenues === 'function') tickVenues(); });
  _safe('oracle', () => { if (typeof tickOracle === 'function') tickOracle(); });
  _safe('tutorial', () => { if (typeof tickTutorial === 'function') tickTutorial(); });
  _safe('monthChange', () => checkMonthChange());
  _safe('diplomacyInvasion', () => {
    if (!(typeof isColonyPhase === 'function' && isColonyPhase())){
      if (typeof tickRivalAI === 'function') tickRivalAI();
      if (typeof tickNavalThreats === 'function') tickNavalThreats();
      tickDiplomacy();
      if (typeof tickInvasion === 'function') tickInvasion();
    }
  });
  _safe('creatures', () => tickCreatures());
  _safe('observerOverlay', () => { if (typeof tickObserverCoverageExpiry === 'function') tickObserverCoverageExpiry(); });
  _safe('militaryAgents', () => { if (typeof tickMilitaryAgents === 'function') tickMilitaryAgents(); });
  _safe('godAgents', () => { if (typeof tickGodAgents === 'function') tickGodAgents(); });

  _safe('hudRefresh', () => {
    renderCalendarPanel();
    renderCreaturePanel();
    if (inspectedTile) renderInspector(inspectedTile.col, inspectedTile.row);
    updateResourceBar(caps);
    if (typeof renderHud === 'function') renderHud();
  });
  // Affichage : boucle requestAnimationFrame (loop.js), pas de render() ici.
}

// Défensif : écrit dans chaque pastille seulement si elle existe dans l'interface
// actuelle -- pendant la migration UI, certaines (ou toutes) peuvent ne pas encore
// exister sans que ça doive jamais interrompre le tick.
function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateResourceBar(caps){
  caps = caps || computeCaps();
  setText('resWheat', `${Math.floor(resources.wheat)}/${caps.wheat}`);
  setText('resMarble', `${Math.floor(resources.marble)}/${caps.marble}`);
  setText('resSculpture', `${Math.floor(resources.sculpture)}/${caps.sculpture}`);
  setText('resOlives', `${Math.floor(resources.olives)}/${caps.olives}`);
  setText('resOil', `${Math.floor(resources.oil)}/${caps.oil}`);
  setText('resGrapes', `${Math.floor(resources.grapes)}/${caps.grapes}`);
  setText('resWine', `${Math.floor(resources.wine)}/${caps.wine}`);
  setText('resWool', `${Math.floor(resources.wool)}/${caps.wool}`);
  setText('resClothing', `${Math.floor(resources.clothing || 0)}/${caps.clothing || 0}`);
  setText('resFish', `${Math.floor(resources.fish || 0)}/${caps.fish || 0}`);
  setText('resCoal', `${Math.floor(resources.coal || 0)}/${caps.coal || 0}`);
  setText('resBronze', `${Math.floor(resources.bronze || 0)}/${caps.bronze || 0}`);
  setText('resArms', `${Math.floor(resources.arms || 0)}/${caps.arms || 0}`);
  setText('resPopulation', computeTotalPopulation());
  setText('resFavor', `${Math.round(favor)}/${FAVOR_MAX}`);
  setText('resTreasury', Math.floor(treasury));
  // emploi : main-d'œuvre disponible (population) / postes à pourvoir (industrie)
  setText('resEmployment', `${employment.supply}/${employment.demand}`);
  if (typeof renderManageResourceList === 'function') renderManageResourceList();
  if (typeof renderEconomyBalance === 'function') renderEconomyBalance();
  refreshAffordability();
}
