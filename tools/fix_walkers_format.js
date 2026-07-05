const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'js', 'walkers.js');
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
while (s.includes('\n\n')) {
  s = s.replace(/\n\n/g, '\n');
}
const oldBlock = `function isTileFireServed(col, row){
  if (walkerPassDeliveryEnabled()){
    const key = tileKey(col, row);
    return walkers.some(w => {
      if (w.serviceType !== 'fire') return false;
      if (w.servedToday && w.servedToday.has(key)) return true;
      for (const h of w.servedHouses){
        if (h.col === col && h.row === row) return w.servedToday.has(tileKey(h.col, h.row));
      }
      const adjHouseServed = housesAdjacentToTile(col, row).some(h => {
        return w.servedToday && w.servedToday.has(tileKey(h.col, h.row));
      });
      if (adjHouseServed) return true;
      return false;
    });
  }
  return walkers.some(w => {
    if (w.serviceType !== 'fire') return false;
    const def = BUILDING_DEFS[w.type];
    const range = def && def.range != null ? def.range : 18;
    return computeServiceReach(w.col, w.row, range).some(t => t.col === col && t.row === row);
  });
}`;
const newBlock = `function isTileFireServed(col, row){
  return walkers.some(w => {
    if (w.serviceType !== 'fire') return false;
    const def = BUILDING_DEFS[w.type];
    const range = def && def.range != null ? def.range : 18;
    return computeServiceReach(w.col, w.row, range).some(t => t.col === col && t.row === row);
  });
}`;
if (!s.includes(oldBlock)) {
  console.error('isTileFireServed block not found');
  process.exit(1);
}
s = s.replace(oldBlock, newBlock);
fs.writeFileSync(p, s, 'utf8');
console.log('OK', s.split('\n').length, 'lines');
