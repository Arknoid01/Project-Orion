/* ===================== LIEUX CULTURELS & SPECTACLES ===================== */
// Les lieux (théâtre, gymnase, stoa, académie) doivent être sur le réseau routier
// pour que l'agora puisse distribuer la culture (voir isCultureVenueLinked).
// Quand assez de citoyens sont servis, un spectacle automatique peut se lancer
// (coût vin + sculptures, bonus de croissance temporaire).
let venueEventTicksLeft = 0;
let lastVenueEventDay = -1;

function hasRoadOnOrAdjacent(col, row){
  if (!inBounds(col, row)) return false;
  const here = grid[row][col];
  if ((typeof cellIsRoad === 'function') ? cellIsRoad(here) : here.hasRoad) return true;
  for (const [c, r] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]){
    if (!inBounds(c, r)) continue;
    const cell = grid[r][c];
    if ((typeof cellIsRoad === 'function') ? cellIsRoad(cell) : cell.hasRoad) return true;
  }
  return false;
}

/** True si ce lieu est dans la portée route de l'agora (comme isCultureVenueLinked, mais par bâtiment). */
function isVenueCultureNetworkLinked(venueCol, venueRow){
  let linked = false;
  forEachBuilding((type, col, row) => {
    if (type !== 'agora' || linked) return;
    const def = BUILDING_DEFS.agora;
    const range = def && def.range != null ? def.range : 18;
    const reachKeys = new Set(
      computeServiceReach(col, row, range).map(t => tileKey(t.col, t.row)));
    if (reachKeys.has(tileKey(venueCol, venueRow))) linked = true;
    for (const [c, r] of [[venueCol - 1, venueRow], [venueCol + 1, venueRow], [venueCol, venueRow - 1], [venueCol, venueRow + 1]]){
      if (inBounds(c, r) && reachKeys.has(tileKey(c, r))) linked = true;
    }
  });
  return linked;
}

function countCultureVenues(){
  let n = 0;
  forEachBuilding((type) => {
    if (BUILDING_DEFS[type] && BUILDING_DEFS[type].isVenue) n++;
  });
  return n;
}

function countCultureServedHouses(){
  let n = 0;
  forEachBuilding((type, col, row) => {
    if (type !== 'maison') return;
    if (typeof isHouseServedBy === 'function' && isHouseServedBy('culture', col, row)) n++;
  });
  return n;
}

function venueHappinessBonus(){
  return venueEventTicksLeft > 0 ? VENUE_EVENT_GROWTH_BONUS : 0;
}

function tryStartVenueEvent(){
  if (venueEventTicksLeft > 0) return;
  if (countCultureVenues() < 1) return;

  const day = Math.floor(DEBUG.tickCount / DAY_DURATION_TICKS);
  if (day === lastVenueEventDay) return;
  if (DEBUG.tickCount % DAY_DURATION_TICKS !== 0) return;
  if (Math.random() > VENUE_EVENT_CHANCE) return;

  if (countCultureServedHouses() < VENUE_EVENT_MIN_SERVED) return;

  for (const [res, amt] of Object.entries(VENUE_EVENT_COST)){
    if ((resources[res] || 0) < amt) return;
  }

  for (const [res, amt] of Object.entries(VENUE_EVENT_COST)) resources[res] -= amt;
  venueEventTicksLeft = VENUE_EVENT_DURATION_TICKS;
  lastVenueEventDay = day;

  debugInfo('Spectacle culturel', { venues: countCultureVenues(), served: countCultureServedHouses() });
  if (typeof chronicleLog === 'function') chronicleLog(t('venue.eventStarted'), 'good');
  else showNotification(t('venue.eventStarted'), 'good');
  if (typeof updateResourceBar === 'function') updateResourceBar();
}

function tickVenues(){
  tryStartVenueEvent();
  if (venueEventTicksLeft > 0){
    venueEventTicksLeft--;
    if (venueEventTicksLeft === 0) debugInfo('Fin du spectacle culturel');
  }
  renderVenuePanel();
}

function renderVenuePanel(){
  const el = document.getElementById('venueStatus');
  if (!el) return;
  el.textContent = venueEventTicksLeft > 0
    ? t('venue.eventActive', { ticks: venueEventTicksLeft })
    : '';
}

window.countCultureVenues = countCultureVenues;
window.countCultureServedHouses = countCultureServedHouses;
window.hasRoadOnOrAdjacent = hasRoadOnOrAdjacent;
window.isVenueCultureNetworkLinked = isVenueCultureNetworkLinked;
