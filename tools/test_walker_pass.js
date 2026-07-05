/**
 * Tests unitaires — livraison au passage (walkers style Zeus).
 * Usage: node tools/test_walker_pass.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');

// --- mocks minimaux (global, visible to runInThisContext) ---
global.window = global;
global.performance = { now: () => 0 };
global.lastTickTimestamp = 0;
global.treasury = 1000;
global.resources = { wheat: 100 };
global.lastWalkerServiceDay = -1;

const GRID_COLS = 20;
const GRID_ROWS = 20;
global.GRID_COLS = GRID_COLS;
global.GRID_ROWS = GRID_ROWS;
global.DAY_DURATION_TICKS = 10;
global.TICK_DURATION_MS = 1000;
global.WALKER_PASS_DELIVERY = true;
global.WALKER_CARRY_BY_SERVICE = { water: 3, market: 3, tax: 5, fire: 5, religion: 5, health: 5 };

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

global.HOUSE_LEVELS = [
  { key: 'hut', population: 2, requires: [] },
  { key: 'house', population: 5, requires: ['route', 'food'] },
  { key: 'decent', population: 9, requires: ['route', 'water'] },
  { key: 'residence', population: 20, requires: ['route', 'water', 'religion'] },
  { key: 'palais', population: 30, requires: ['route', 'water', 'health'] },
];

global.BUILDING_DEFS = {
  fountain: { isService: true, serviceType: 'water', range: 18, capacity: 12 },
  granary: {},
  market: { isService: true, serviceType: 'market', range: 18, capacity: 12 },
  temple: { isService: true, serviceType: 'religion', range: 18, capacity: 12 },
  clinic: { isService: true, serviceType: 'health', range: 18, capacity: 12 },
  taxOffice: { isService: true, serviceType: 'tax', range: 18, capacity: 12 },
  watchtower: { isService: true, serviceType: 'fire', range: 18, capacity: 12 },
  farm: { produces: 'wheat' },
  maison: { isHouse: true },
};

global.MARKET_GOODS = [
  { need: 'food', resource: 'wheat', perHouse: 1 },
];

global.taxCollectionRate = () => 0.5;
global.collectTaxes = function(){
  let collected = 0;
  const perPop = taxCollectionRate();
  walkers.filter(w => w.serviceType === 'tax').forEach(w => {
    forEachBuilding((type, col, row) => {
      if (type !== 'maison') return;
      if (!isTileInServiceReach(w, col, row)) return;
      collected += grid[row][col].population * perPop;
    });
  });
  treasury += collected;
  return collected;
};
global.makeCell = makeCell;
global.isTileBeautiful = () => false;

const gameScripts = ['walkers.js', 'market.js', 'houses.js']
  .map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8'))
  .join('\n\n');

const testScript = `
${gameScripts}

function assert(cond, msg){
  if (!cond) throw new Error('FAIL: ' + msg);
}

function setupWaterLine(){
  grid[5][5].building = 'fountain';
  for (let c = 6; c <= 12; c++) grid[5][c].hasRoad = true;
  for (let c = 7; c <= 10; c++){
    grid[4][c].building = 'maison';
    grid[4][c].houseLevel = 2;
    grid[4][c].population = 9;
  }
  recomputeAllWalkers();
}

console.log('Test 1: eligible but not served before patrol');
setupWaterLine();
const w = walkers.find(x => x.serviceType === 'water');
assert(w, 'water walker exists');
assert(w.servedHouses.length === 4, '4 eligible houses');
assert(!isHouseServedBy('water', 7, 4), 'house not served yet');
assert(w.inventory === 3, 'inventory full');

console.log('Test 2: pass delivery serves all eligible houses along patrol');
for (let i = 0; i < 15; i++) advanceWalkers();
assert(w.servedToday.size === w.servedHouses.length, 'all eligible houses served on patrol');

console.log('Test 3: day reset clears servedToday');
const servedBeforeDay = w.servedToday.size;
assert(servedBeforeDay >= 1, 'precondition: houses served before day change');
DEBUG.tickCount = DAY_DURATION_TICKS;
advanceWalkers();
assert(w.servedToday.size < servedBeforeDay, 'servedToday reset on new day');
assert(w.servedToday.size <= w.carryCapacity, 'fresh daily budget after rollover');

console.log('Test 4: market needs granary on road network');
DEBUG.tickCount = 0;
lastWalkerServiceDay = -1;
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell({ terrain: 'grass' });
grid[3][3].building = 'market';
grid[3][4].hasRoad = true;
grid[3][5].hasRoad = true;
grid[2][5].building = 'maison';
grid[2][5].houseLevel = 1;
grid[2][5].population = 5;
resources.wheat = 10;
recomputeAllWalkers();
const m = walkers.find(x => x.serviceType === 'market');
assert(m, 'market walker');
assert(!isGranaryRoadLinked(3, 3, 18), 'no granary yet');
for (let i = 0; i < 20; i++) advanceWalkers();
assert(!isHouseSupplied('food', 5, 2), 'no food without granary link');

grid[3][6].hasRoad = true;
grid[3][7].hasRoad = true;
grid[3][7].building = 'granary';
recomputeAllWalkers();
assert(isGranaryRoadLinked(3, 3, 18), 'granary linked');
for (let i = 0; i < 25; i++) advanceWalkers();
assert(isHouseSupplied('food', 5, 2), 'food delivered after granary on network');

console.log('Test 5: full patrol eventually serves all eligible houses');
DEBUG.tickCount = 0;
lastWalkerServiceDay = -1;
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell();
setupWaterLine();
const eligible = walkers[0].servedHouses.length;
for (let i = 0; i < 15; i++) advanceWalkers();
assert(walkers[0].servedToday.size === eligible, 'all eligible houses served after patrol');

console.log('Test 6: fire building needs watchman pass today');
DEBUG.tickCount = 0;
lastWalkerServiceDay = -1;
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell();
grid[5][5].building = 'watchtower';
for (let c = 6; c <= 10; c++) grid[5][c].hasRoad = true;
grid[4][8].building = 'farm';
recomputeAllWalkers();
assert(isTileFireEligible(8, 4), 'farm eligible on road network');
assert(!isTileFireServed(8, 4), 'farm not protected before patrol');
for (let i = 0; i < 25; i++){
  advanceWalkers();
  if (isTileFireServed(8, 4)) break;
}
assert(isTileFireServed(8, 4), 'farm protected after watchman pass');

console.log('Test 7: tax collected for registered houses each tick');
DEBUG.tickCount = 0;
lastWalkerServiceDay = -1;
treasury = 1000;
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell();
grid[5][5].building = 'taxOffice';
for (let c = 6; c <= 9; c++) grid[5][c].hasRoad = true;
grid[4][7].building = 'maison';
grid[4][7].houseLevel = 1;
grid[4][7].population = 5;
recomputeAllWalkers();
const beforeTax = treasury;
collectTaxes();
assert(treasury > beforeTax, 'tax collected each tick for houses in tax coverage');

console.log('Test 8: religion served on pass');
DEBUG.tickCount = 0;
lastWalkerServiceDay = -1;
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell();
grid[5][5].building = 'temple';
for (let c = 6; c <= 9; c++) grid[5][c].hasRoad = true;
grid[4][7].building = 'maison';
grid[4][7].houseLevel = 3;
grid[4][7].population = 20;
recomputeAllWalkers();
assert(!isHouseServedBy('religion', 7, 4), 'religion not served before patrol');
for (let i = 0; i < 20; i++){
  advanceWalkers();
  if (isHouseServedBy('religion', 7, 4)) break;
}
assert(isHouseServedBy('religion', 7, 4), 'religion served after temple walker pass');

console.log('Test 9: health served on pass');
DEBUG.tickCount = 0;
lastWalkerServiceDay = -1;
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell();
grid[5][5].building = 'clinic';
for (let c = 6; c <= 9; c++) grid[5][c].hasRoad = true;
grid[4][7].building = 'maison';
grid[4][7].houseLevel = 4;
grid[4][7].population = 30;
recomputeAllWalkers();
assert(!isHouseServedBy('health', 7, 4), 'health not served before patrol');
for (let i = 0; i < 20; i++){
  advanceWalkers();
  if (isHouseServedBy('health', 7, 4)) break;
}
assert(isHouseServedBy('health', 7, 4), 'health served after clinic walker pass');

console.log('Test 10: icon states pending vs missing');
DEBUG.tickCount = 0;
lastWalkerServiceDay = -1;
resetWalkerDailyService();
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell();
setupWaterLine();
assert(needIconState('water', 7, 4) === 'pending', 'eligible house shows pending water');
assert(needIconState('water', 7, 4) === 'ok' || needIconState('water', 7, 4) === 'pending', 'water state valid');
grid[99] = grid[99] || makeCell();
assert(needIconState('water', 15, 15) === 'missing', 'far tile missing water coverage');
for (let i = 0; i < 25; i++){
  advanceWalkers();
  if (needIconState('water', 7, 4) === 'ok') break;
}
assert(needIconState('water', 7, 4) === 'ok', 'water icon clears after service');

console.log('Test 11: fire patrol covers branch roads near watchtower');
DEBUG.tickCount = 0;
lastWalkerServiceDay = -1;
resetWalkerDailyService();
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell();
grid[5][5].building = 'watchtower';
grid[5][6].hasRoad = true;
grid[5][7].hasRoad = true;
grid[4][7].hasRoad = true;
grid[4][6].building = 'farm';
recomputeAllWalkers();
const firePath = walkers[0].path.map(t => t.col + ',' + t.row);
assert(firePath.includes('7,4'), 'patrol visits branch road tile');
assert(isTileFireEligible(6, 4), 'farm 2 tiles from tower is eligible');
assert(!isTileFireServed(6, 4), 'farm not protected before patrol');
for (let i = 0; i < 50; i++){
  advanceWalkers();
  if (isTileFireServed(6, 4)) break;
}
assert(isTileFireServed(6, 4), 'farm protected after full patrol coverage');

console.log('\\nAll walker pass tests passed.');
`;

vm.runInThisContext(testScript, { filename: 'test_walker_pass.bundle.js' });
