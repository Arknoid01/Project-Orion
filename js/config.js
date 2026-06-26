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
// isService / range / capacity : bâtiments à walker (voir walkers.js).
// range = longueur max du trajet de patrouille (en cases de route), capacity = nb de
// maisons desservies au maximum par ce bâtiment.
const BUILDING_DEFS = {
  farm:     { name:'building.farm',     icon:'🌾', color:'#c9a227', validTerrain:'wheat',  produces:'wheat',     rate:2, sprite:'assets/buildings/farm.png' },
  quarry:   { name:'building.quarry',   icon:'⛏️', color:'#9aa5ab', validTerrain:'marble', produces:'marble',    rate:1 },
  granary:  { name:'building.granary',  icon:'🏺', color:'#8a5a3b', validTerrain:'grass',  storageBonus:{wheat:150}, sprite:'assets/buildings/granary.png' },
  workshop: { name:'building.workshop', icon:'🏛️', color:'#b5651d', validTerrain:'grass',  consumes:{marble:1}, produces:'sculpture', rate:0.5 },
  fountain: { name:'building.fountain', icon:'⛲', color:'#5a8fae', validTerrain:'grass',  isService:true, serviceType:'water', range:20, capacity:8 },
  market:   { name:'building.market',   icon:'🏪', color:'#c97b3d', validTerrain:'grass',  isService:true, serviceType:'food',  range:20, capacity:8 },
  maison:   { name:'building.maison',   icon:'🏠', color:'#c9b68f', validTerrain:'grass',  isHouse:true }
};

// Quantité de blé consommée par maison nourrie, par tick (voir market.js).
const FOOD_PER_HOUSE = 1;

const TERRAIN_COLORS = {
  grass:  '#7ea24c',
  wheat:  '#d4b35c',
  marble: '#cfcac0',
  water:  '#3f7ea6'
};

const BASE_CAP = { wheat:50, marble:60, sculpture:30 };

/* ===================== NIVEAUX DE MAISON ===================== */
// requires : liste de clés de besoin (voir NEED_CHECKERS dans houses.js).
// route/water/food sont fonctionnels. 'beauty' reste un stub en attente
// de la phase embellissement, et renverra toujours false jusqu'à ce moment-là.
const HOUSE_LEVELS = [
  { key:'hut',    nameKey:'houseLevel.hut',    population:2,  requires:[] },
  { key:'house',  nameKey:'houseLevel.house',  population:5,  requires:['route'] },
  { key:'decent', nameKey:'houseLevel.decent', population:9,  requires:['route','water'] },
  { key:'villa',  nameKey:'houseLevel.villa',  population:15, requires:['route','water','food'] },
];

/* ===================== PALETTES MAISONS PROCEDURALES ===================== */
const HOUSE_WALL_COLORS  = ['#d8c9a3', '#c9b68f', '#bfa77d', '#e3d6b8'];
const HOUSE_ROOF_COLORS  = ['#a8512f', '#8c3f24', '#9c6b3f', '#6f5a4a'];
const HOUSE_TRIM_COLORS  = ['#a8472f', '#5d6b3a', '#7d6b4a'];
const HOUSE_ROOF_SHAPES  = ['pyramid', 'dome', 'flat'];

/* ===================== SPRITE DE PERSONNAGE (WALKER) ===================== */
// Feuille LPC (Universal LPC Spritesheet) : 64x64 par frame, 4 lignes (directions),
// 9 frames de marche utilisées par ligne (les colonnes 9-12 sont du remplissage vide).
const WALKER_SPRITE_PATH = 'assets/characters/walk.png';
const WALKER_FRAME_SIZE = 64;
const WALKER_FRAMES_PER_CYCLE = 9;
const WALKER_DIRECTION_ROWS = { up: 0, left: 1, down: 2, right: 3 };
const WALKER_ANIM_FRAME_MS = 110; // ~9 frames -> un cycle complet toutes les ~990ms
const WALKER_DISPLAY_SIZE = 40;   // taille d'affichage sur la grille (mise à l'échelle depuis 64px)

/* ===================== MYTHOLOGIE ===================== */
const FAVOR_MAX = 100;
const FAVOR_DECAY_PER_TICK = 0.1;          // déclin naturel, sans offrande
const FAVOR_OFFERING_COST = { sculpture: 5 };
const FAVOR_OFFERING_GAIN = 15;
const FAVOR_BLESSING_THRESHOLD = 80;       // au-dessus : bénédiction possible
const FAVOR_CATASTROPHE_THRESHOLD = 20;    // en-dessous : catastrophe possible
const FAVOR_EVENT_CHANCE_PER_TICK = 0.03;  // 3%/tick une fois le seuil franchi
const PRODUCTION_BOOST_MULTIPLIER = 1.5;
const PRODUCTION_PENALTY_MULTIPLIER = 0.5;
const PRODUCTION_EFFECT_DURATION_TICKS = 20; // ~20 secondes
