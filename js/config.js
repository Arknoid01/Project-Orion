/* ===================== CONFIG GRILLE / ISO ===================== */
const GRID_COLS = 14;
const GRID_ROWS = 14;
const TILE_W = 64;
const TILE_H = 32;
const OFFSET_X = 450; // centre horizontal du canvas
const OFFSET_Y = 50;  // marge haute

/* ===================== DEFINITIONS BATIMENTS ===================== */
// validTerrain: terrain requis sous le bâtiment
// produces / consumes : ressource produite/consommée par tick
// storageBonus : bonus de capacité de stockage apporté à la ville
// sprite : chemin du PNG réel (généré via le pipeline ComfyUI), sinon rendu procédural de secours
// name : clé de traduction (voir js/i18n.js), pas le texte affiché directement
const BUILDING_DEFS = {
  farm:     { name:'building.farm',     icon:'🌾', color:'#c9a227', validTerrain:'wheat',  produces:'wheat',     rate:2, sprite:'assets/buildings/farm.png' },
  quarry:   { name:'building.quarry',   icon:'⛏️', color:'#9aa5ab', validTerrain:'marble', produces:'marble',    rate:1 },
  granary:  { name:'building.granary',  icon:'🏺', color:'#8a5a3b', validTerrain:'grass',  storageBonus:{wheat:150}, sprite:'assets/buildings/granary.png' },
  workshop: { name:'building.workshop', icon:'🏛️', color:'#b5651d', validTerrain:'grass',  consumes:{marble:1}, produces:'sculpture', rate:0.5 },
  maison:   { name:'building.maison',   icon:'🏠', color:'#c9b68f', validTerrain:'grass',  isHouse:true }
};

const TERRAIN_COLORS = {
  grass:  '#7ea24c',
  wheat:  '#d4b35c',
  marble: '#cfcac0',
  water:  '#3f7ea6'
};

const BASE_CAP = { wheat:50, marble:60, sculpture:30 };

/* ===================== PALETTES MAISONS PROCEDURALES ===================== */
const HOUSE_WALL_COLORS  = ['#d8c9a3', '#c9b68f', '#bfa77d', '#e3d6b8'];
const HOUSE_ROOF_COLORS  = ['#a8512f', '#8c3f24', '#9c6b3f', '#6f5a4a'];
const HOUSE_TRIM_COLORS  = ['#a8472f', '#5d6b3a', '#7d6b4a'];
const HOUSE_ROOF_SHAPES  = ['pyramid', 'dome', 'flat'];
