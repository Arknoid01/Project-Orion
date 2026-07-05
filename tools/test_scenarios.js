/* Smoke test — 12 scénarios à objectifs + parcours campagne */
const fs = require('fs');
const path = require('path');

const scenariosSrc = fs.readFileSync(path.join(__dirname, '../js/scenarios.js'), 'utf8');
const campaignSrc = fs.readFileSync(path.join(__dirname, '../js/campaign.js'), 'utf8');

const scenarioIds = [...scenariosSrc.matchAll(/id:\s*'([^']+)'/g)]
  .map(m => m[1])
  .filter((id, i, arr) => arr.indexOf(id) === i);

const freePlay = scenarioIds.filter(id => id !== 'sandbox');
const pathIds = [...campaignSrc.matchAll(/id:\s*'(attica|archipelago|pelion|thrace|wineRoute)'/g)].map(m => m[1]);
const episodeBlocks = campaignSrc.match(/episodes:\s*\[/g) || [];

let failed = 0;
function ok(cond, msg){
  if (!cond){ console.error('FAIL:', msg); failed++; }
  else console.log('OK:', msg);
}

ok(freePlay.length >= 12, `au moins 12 scénarios libres (${freePlay.length})`);
ok(pathIds.length >= 5, `au moins 5 parcours campagne (${pathIds.length})`);
ok(episodeBlocks.length >= 5, `épisodes définis par parcours (${episodeBlocks.length})`);

process.exit(failed ? 1 : 0);
