/**
 * Tests unitaires — chaîne culture Phase 1 (agora, lieux, walker pass).
 * Usage: node tools/test_culture.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');

global.window = global;
global.performance = { now: () => 0 };
global.lastTickTimestamp = 0;
global.treasury = 1000;
global.resources = { wheat: 50, wine: 20, sculpture: 10 };
global.lastWalkerServiceDay = -1;
global.venueEventTicksLeft = 0;
global.lastVenueEventDay = -1;

const GRID_COLS = 24;
const GRID_ROWS = 24;
global.GRID_COLS = GRID_COLS;
global.GRID_ROWS = GRID_ROWS;
global.DAY_DURATION_TICKS = 10;
global.TICK_DURATION_MS = 1000;
global.WALKER_PASS_DELIVERY = true;
global.WALKER_CARRY_BY_SERVICE = {
  water: 3, market: 3, tax: 5, fire: 5, religion: 5, health: 5, culture: 4,
};
global.VENUE_EVENT_COST = { wine: 4, sculpture: 2 };
global.VENUE_EVENT_DURATION_TICKS = 45;
global.VENUE_EVENT_GROWTH_BONUS = 0.08;
global.VENUE_EVENT_MIN_SERVED = 1;
global.VENUE_EVENT_CHANCE = 1;

function makeCell(extra){
  return Object.assign({
    terrain: 'grass', building: null, hasRoad: false, houseLevel: 0, population: 0,
    patrolBlock: false, beauty: 0, level: 1, elevation: 0, slope: 0,
  }, extra || {});
}

global.grid = [];
for (let r = 0; r < GRID_ROWS; r++){
  const row = [];
  for (let c = 0; c < GRID_COLS; c++) row.push(makeCell());
  grid.push(row);
}

global.inBounds = (c, r) => c >= 0 && r >= 0 && c < GRID_COLS && r < GRID_ROWS;
global.forEachBuilding = (fn) => {
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      if (grid[r][c].building) fn(grid[r][c].building, c, r);
};
global.tileDiamondCenter = (c, r) => ({ x: c * 64, y: r * 32 });
global.debugInfo = () => {};
global.DEBUG = { tickCount: 0 };
global.markHouseIconsDirty = () => {};
global.hashSeed = (c, r) => c * 1000 + r;
global.mulberry32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; return ((a ^ (a >>> 15)) >>> 0) / 4294967296; };
global.showNotification = () => {};
global.t = (k) => k;
global.updateResourceBar = () => {};

global.HOUSE_LEVELS = [
  { key: 'hut', population: 2, requires: [] },
  { key: 'house', population: 5, requires: ['route'] },
  { key: 'decent', population: 9, requires: ['route', 'water'] },
  { key: 'villa', population: 15, requires: ['route', 'water', 'food', 'culture'] },
  { key: 'domaine', population: 24, requires: ['route', 'water', 'food', 'oil', 'culture', 'beauty'] },
];

global.BUILDING_DEFS = {
  agora: { isService: true, serviceType: 'culture', range: 18, capacity: 14 },
  theatre: { isVenue: true, venueKind: 'theatre', beauty: 4, range: 3 },
  stoa: { isVenue: true, venueKind: 'stoa', beauty: 3, range: 2 },
  fountain: { isService: true, serviceType: 'water', range: 18, capacity: 12 },
  market: { isService: true, serviceType: 'market', range: 18, capacity: 12 },
  granary: {},
  maison: { isHouse: true },
};

global.MARKET_GOODS = [{ need: 'food', resource: 'wheat', perHouse: 1 }];
global.taxCollectionRate = () => 0.5;
global.makeCell = makeCell;
global.isTileBeautiful = () => false;

const gameScripts = ['walkers.js', 'market.js', 'houses.js', 'venues.js']
  .map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8'))
  .join('\n\n');

const testScript = `
${gameScripts}

function assert(cond, msg){
  if (!cond) throw new Error('FAIL: ' + msg);
}

function resetGrid(){
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell({ terrain: 'grass' });
  DEBUG.tickCount = 0;
  lastWalkerServiceDay = -1;
  venueEventTicksLeft = 0;
  lastVenueEventDay = -1;
  resources.wine = 20;
  resources.sculpture = 10;
  resetWalkerDailyService();
}

function layCultureLine(){
  grid[5][5].building = 'agora';
  for (let c = 6; c <= 12; c++) grid[5][c].hasRoad = true;
  grid[4][10].building = 'theatre';
  grid[5][10].hasRoad = true;
  grid[4][8].building = 'maison';
  grid[4][8].houseLevel = 3;
  grid[4][8].population = 15;
  recomputeAllWalkers();
}

console.log('Test 1: isCultureVenueLinked requires venue on road network');
resetGrid();
grid[5][5].building = 'agora';
for (let c = 6; c <= 9; c++) grid[5][c].hasRoad = true;
recomputeAllWalkers();
assert(!isCultureVenueLinked(5, 5, 18), 'no venue -> not linked');
grid[4][15].building = 'theatre';
assert(!isCultureVenueLinked(5, 5, 18), 'venue far from road network -> not linked');
for (let c = 10; c <= 15; c++) grid[5][c].hasRoad = true;
recomputeAllWalkers();
assert(isCultureVenueLinked(5, 5, 18), 'theatre adjacent to road in reach -> linked');

console.log('Test 2: culture walker delivers to villa when venues linked');
resetGrid();
layCultureLine();
const cw = walkers.find(w => w.serviceType === 'culture');
assert(cw, 'culture walker exists');
assert(!isHouseServedBy('culture', 8, 4), 'villa not served before patrol');
for (let i = 0; i < 30; i++){
  advanceWalkers();
  if (isHouseServedBy('culture', 8, 4)) break;
}
assert(isHouseServedBy('culture', 8, 4), 'villa served after culture walker pass');

console.log('Test 3: no culture delivery without linked venue');
resetGrid();
grid[5][5].building = 'agora';
for (let c = 6; c <= 10; c++) grid[5][c].hasRoad = true;
grid[4][8].building = 'maison';
grid[4][8].houseLevel = 3;
grid[4][8].population = 15;
recomputeAllWalkers();
assert(!isCultureVenueLinked(5, 5, 18), 'precondition: no venue');
for (let i = 0; i < 35; i++) advanceWalkers();
assert(!isHouseServedBy('culture', 8, 4), 'villa stays unserved without venue');
assert(needIconState('culture', 8, 4) === 'missing', 'culture icon missing without venue');

console.log('Test 4: isVenueCultureNetworkLinked per building');
resetGrid();
layCultureLine();
assert(isVenueCultureNetworkLinked(10, 4), 'theatre linked to agora network');
grid[4][2].building = 'stoa';
assert(!isVenueCultureNetworkLinked(2, 4), 'stoa off roads not linked');

console.log('Test 5: venue spectacle can start when enough houses served');
resetGrid();
layCultureLine();
for (let i = 0; i < 30; i++){
  advanceWalkers();
  if (isHouseServedBy('culture', 8, 4)) break;
}
assert(isHouseServedBy('culture', 8, 4), 'precondition: house culture-served');
DEBUG.tickCount = DAY_DURATION_TICKS;
tryStartVenueEvent();
assert(venueEventTicksLeft > 0, 'spectacle starts with served houses and resources');
assert(typeof venueHappinessBonus === 'function' && venueHappinessBonus() > 0, 'spectacle grants growth bonus');

console.log('\\nAll culture chain tests passed.');
`;

vm.runInThisContext(testScript, { filename: 'test_culture.bundle.js' });
