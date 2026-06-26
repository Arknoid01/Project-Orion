/* ===================== SYSTEME DE TRADUCTION (FR/EN) ===================== */
// Volontairement simple : un dictionnaire plat clé -> texte par langue.
// Le français sert de repli si une clé manque en anglais (pratique pendant
// le développement : on peut ajouter une clé en FR et la traduire plus tard
// sans rien casser).

let currentLang = 'fr';

const STRINGS = {
  fr: {
    'app.subtitle': 'Prototype',
    'resource.wheat': 'Blé',
    'resource.marble': 'Marbre',
    'resource.sculpture': 'Sculptures',
    'panel.buildings': 'Bâtiments',
    'panel.inspector': 'Inspecteur',
    'inspector.placeholder': 'Sélectionne une maison pour voir son niveau, sa population et ses besoins — arrive en Phase 2.',
    'action.demolish': '🔨 Démolir',
    'action.reset': '↺ Réinitialiser la carte',
    'action.road': '🛣️ Route',
    'action.block': '🚧 Borne de blocage',
    'info.hasRoad': 'route',
    'terrainReq.wheat': 'sur blé',
    'terrainReq.marble': 'sur marbre',
    'terrainReq.grass': 'sur herbe',
    'terrainName.grass': 'herbe',
    'terrainName.wheat': 'blé',
    'terrainName.marble': 'marbre',
    'terrainName.water': 'eau',
    'building.farm': 'Ferme',
    'building.quarry': 'Carrière',
    'building.granary': 'Grenier',
    'building.workshop': 'Atelier',
    'building.maison': 'Maison',
    'building.fountain': 'Fontaine',
    'building.market': 'Marché',
    'info.hover': 'Survolez une case pour voir son contenu.',
    'info.tile': 'Case ({col}, {row}) — Terrain : {terrain} — Bâtiment : {building}',
    'info.empty': 'vide',
    'resource.population': 'Population',
    'houseLevel.hut': 'Cabane',
    'houseLevel.house': 'Maison',
    'houseLevel.decent': 'Maison correcte',
    'houseLevel.villa': 'Villa',
    'need.route': 'Accès à une route',
    'need.water': 'Desservi par une fontaine',
    'need.food': 'Nourri par un marché',
    'need.beauty': 'Embellissement (à venir)',
    'need.maxLevel': 'Niveau maximum atteint',
    'inspector.level': 'niveau',
    'inspector.population': 'Population',
    'inspector.nextNeeds': 'Besoins pour évoluer :',
  },
  en: {
    'app.subtitle': 'Prototype',
    'resource.wheat': 'Wheat',
    'resource.marble': 'Marble',
    'resource.sculpture': 'Sculptures',
    'panel.buildings': 'Buildings',
    'panel.inspector': 'Inspector',
    'inspector.placeholder': 'Select a house to see its level, population and needs — coming in Phase 2.',
    'action.demolish': '🔨 Demolish',
    'action.reset': '↺ Reset map',
    'action.road': '🛣️ Road',
    'action.block': '🚧 Block marker',
    'info.hasRoad': 'road',
    'terrainReq.wheat': 'on wheat',
    'terrainReq.marble': 'on marble',
    'terrainReq.grass': 'on grass',
    'terrainName.grass': 'grass',
    'terrainName.wheat': 'wheat',
    'terrainName.marble': 'marble',
    'terrainName.water': 'water',
    'building.farm': 'Farm',
    'building.quarry': 'Quarry',
    'building.granary': 'Granary',
    'building.workshop': 'Workshop',
    'building.maison': 'House',
    'building.fountain': 'Fountain',
    'building.market': 'Market',
    'info.hover': 'Hover a tile to see its content.',
    'info.tile': 'Tile ({col}, {row}) — Terrain: {terrain} — Building: {building}',
    'info.empty': 'empty',
    'resource.population': 'Population',
    'houseLevel.hut': 'Hut',
    'houseLevel.house': 'House',
    'houseLevel.decent': 'Decent house',
    'houseLevel.villa': 'Villa',
    'need.route': 'Road access',
    'need.water': 'Served by a fountain',
    'need.food': 'Fed by a market',
    'need.beauty': 'Beautification (coming soon)',
    'need.maxLevel': 'Maximum level reached',
    'inspector.level': 'level',
    'inspector.population': 'Population',
    'inspector.nextNeeds': 'Needs to evolve:',
  }
};

function t(key, vars){
  let str = STRINGS[currentLang] ? STRINGS[currentLang][key] : undefined;
  if (str === undefined){
    if (typeof debugWarn === 'function'){
      debugWarn(`Clé de traduction manquante : ${key} (${currentLang})`);
    }
    str = STRINGS.fr[key] !== undefined ? STRINGS.fr[key] : key; // repli FR, puis la clé brute
  }
  if (vars){
    for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
  }
  return str;
}

function applyStaticTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

function setLanguage(lang){
  currentLang = lang;
  if (typeof debugInfo === 'function') debugInfo(`Langue changée : ${lang}`);
  applyStaticTranslations();
  // re-génère la palette et la barre de ressources avec les nouveaux libellés
  if (typeof buildPalette === 'function'){
    document.getElementById('buildingButtons').innerHTML = '';
    buildPalette();
    refreshButtonStates();
  }
  if (typeof updateResourceBar === 'function') updateResourceBar();
}
