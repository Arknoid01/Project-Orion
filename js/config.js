/* ===================== CONFIG GRILLE / ISO ===================== */
const GRID_COLS = 60;
const GRID_ROWS = 60;
const TILE_W = 64;
const TILE_H = 32;
const OFFSET_X = 1952; // centre horizontal (grille 60×60)
const OFFSET_Y = 80;
const ELEVATION_PIXELS = 26; // relief accentué

const WORLD_WIDTH = 3960;
const WORLD_HEIGHT = 2040;

/* ===================== ZOOM ===================== */
const ZOOM_DEFAULT = 0.55;  // carte 60×60 : vue reculée par défaut
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
// Résolution interne du canvas (indépendante du zoom affiché) — limite le lag au zoom.
const RENDER_DPR_CAP = 1.5;

/* ===================== DEFINITIONS BATIMENTS ===================== */
// validTerrain: terrain requis sous le bâtiment
// produces / consumes : ressource produite/consommée par tick
// storageBonus : bonus de capacité de stockage apporté à la ville
// isService / range / capacity : bâtiments à walker (voir walkers.js).
// range = longueur max du trajet de patrouille (en cases de route), capacity = nb de
// maisons desservies au maximum par ce bâtiment.
// Économie : cost = prix de pose (drachmes), upkeep = entretien par tick (drachmes),
// workers = postes à pourvoir (uniquement l'industrie : voir labor.js).
// Chaînes de production : un bâtiment "produces" une ressource (à partir du terrain
// ou en "consumes"ant une ressource intermédiaire). Ex. olives -> huile, raisin -> vin.
const BUILDING_DEFS = {
  // ---- Industrie : matières premières (depuis le terrain) ----
  farm:      { name:'building.farm',      icon:'🌾', color:'#c9a227', validTerrain:'wheat',  produces:'wheat',  rate:1.8, sprite:'assets/buildings/farm.png', cost:100, upkeep:1, workers:6 },
  quarry:    { name:'building.quarry',    icon:'⛏️', color:'#9aa5ab', validTerrain:'marble', produces:'marble', rate:1,   sprite:'assets/buildings/quarry.png', cost:120, upkeep:1, workers:6 },
  oliveGrove:{ name:'building.oliveGrove',icon:'🫒', color:'#7a8b3a', validTerrain:'grass',  produces:'olives', rate:1.2, sprite:'assets/buildings/oliveGrove.png', cost:90,  upkeep:1, workers:4 },
  vineyard:  { name:'building.vineyard',  icon:'🍇', color:'#6b3a6b', validTerrain:'grass',  produces:'grapes', rate:1.2, sprite:'assets/buildings/vineyard.png', cost:90,  upkeep:1, workers:4 },
  sheepFarm: { name:'building.sheepFarm', icon:'🐑', color:'#cbc6b8', validTerrain:'grass',  produces:'wool',   rate:0.9, sprite:'assets/buildings/sheepFarm.png', cost:110, upkeep:1, workers:4 },
  // ---- Industrie : ateliers de transformation (consomment une matière) ----
  workshop:  { name:'building.workshop',  icon:'⚒️', color:'#b5651d', validTerrain:'grass',  consumes:{marble:1}, produces:'sculpture', rate:1,   sprite:'assets/buildings/workshop.png', cost:200, upkeep:2, workers:8 },
  oilPress:  { name:'building.oilPress',  icon:'🛢️', color:'#b9a93a', validTerrain:'grass',  consumes:{olives:1}, produces:'oil',       rate:1,   sprite:'assets/buildings/oilPress.png', cost:140, upkeep:1, workers:5 },
  winery:    { name:'building.winery',    icon:'🍷', color:'#7d2b46', validTerrain:'grass',  consumes:{grapes:1}, produces:'wine',      rate:1,   sprite:'assets/buildings/winery.png', cost:140, upkeep:1, workers:5 },
  // ---- Stockage ----
  granary:   { name:'building.granary',   icon:'🏺', color:'#8a5a3b', validTerrain:'grass',  storageBonus:{wheat:150}, sprite:'assets/buildings/granary.png', cost:80, upkeep:1 },
  warehouse: { name:'building.warehouse', icon:'📦', color:'#9c7b4a', validTerrain:'grass',  storageBonus:{ marble:40, sculpture:30, olives:80, oil:100, grapes:80, wine:100, wool:100 }, sprite:'assets/buildings/warehouse.png', cost:100, upkeep:1 },
  // ---- Commerce extérieur ----
  // Exporte chaque mois les marchandises sélectionnées (voir trade.js). Plusieurs
  // comptoirs cumulent leur débit d'export.
  tradingPost:{ name:'building.tradingPost', icon:'⚖️', color:'#b08d57', validTerrain:'grass', isTradePost:true, cost:250, upkeep:2, workers:4, sprite:'assets/buildings/tradingPost.png' },
  // ---- Défense mythologique ----
  // Permet d'invoquer un héros quand un monstre menace la cité (voir creatures.js).
  heroTemple: { name:'building.heroTemple', icon:'⚔️', color:'#9a4a4a', validTerrain:'grass', isHeroTemple:true, cost:300, upkeep:3, sprite:'assets/buildings/heroTemple.png' },
  barracks:   { name:'building.barracks',   icon:'🛡️', color:'#6a6f7a', validTerrain:'grass', isBarracks:true, cost:250, upkeep:2, workers:6, sprite:'assets/buildings/barracks.png' },
  // ---- Services à walker (desservent les maisons à portée) ----
  fountain:  { name:'building.fountain',  icon:'⛲', color:'#5a8fae', validTerrain:'grass',  isService:true, serviceType:'water',    range:18, capacity:6, sprite:'assets/buildings/fountain.png', cost:80,  upkeep:1 },
  market:    { name:'building.market',    icon:'🏪', color:'#c97b3d', validTerrain:'grass',  isService:true, serviceType:'market',   range:18, capacity:6, sprite:'assets/buildings/market.png', cost:120, upkeep:1 },
  temple:    { name:'building.temple',    icon:'🛕', color:'#c4b27a', validTerrain:'grass',  isService:true, serviceType:'religion', range:18, capacity:6, sprite:'assets/buildings/temple.png', cost:150, upkeep:2 },
  clinic:    { name:'building.clinic',    icon:'⚕️', color:'#9ec2c4', validTerrain:'grass',  isService:true, serviceType:'health',   range:18, capacity:6, sprite:'assets/buildings/clinic.png', cost:150, upkeep:2 },
  taxOffice: { name:'building.taxOffice', icon:'💰', color:'#b8943a', validTerrain:'grass',  isService:true, serviceType:'tax',      range:18, capacity:6, cost:150, upkeep:2, sprite:'assets/buildings/taxOffice.png' },
  watchtower:{ name:'building.watchtower',icon:'🗼', color:'#a05a3a', validTerrain:'grass',  isService:true, serviceType:'fire',     range:18, capacity:6, cost:150, upkeep:2, sprite:'assets/buildings/watchtower.png' },
  // ---- Habitation ----
  maison:    { name:'building.maison',    icon:'🏠', color:'#c9b68f', validTerrain:'grass',  isHouse:true, cost:40 },
  // ---- Décorations : diffusent du "cachet" (beauty) autour d'elles (voir beauty.js) ----
  statue:    { name:'building.statue',    icon:'🗿', color:'#cdc7ba', validTerrain:'grass', isDecoration:true, beauty:6, range:2, cost:120, upkeep:1, sprite:'assets/buildings/statue.png' },
  garden:    { name:'building.garden',    icon:'🌳', color:'#6f9a4c', validTerrain:'grass', isDecoration:true, beauty:4, range:3, cost:60, sprite:'assets/buildings/garden.png' },
  colonnade: { name:'building.colonnade', icon:'🏛️', color:'#e3ddcf', validTerrain:'grass', isDecoration:true, beauty:5, range:2, cost:100, upkeep:1, sprite:'assets/buildings/colonnade.png' },
  // ---- Temples monumentaux (2×2 cases) : alliance avec un dieu, avantages puissants ----
  // Voir monuments.js. Coût propre à chaque dieu (GODS), affiché dans la modale de choix.
  grandTemple: { name:'building.grandTemple', icon:'🏛️', color:'#d4af37', validTerrain:'grass', isMonument:true, footprint:2, spriteScale:200,
    sprite:'assets/buildings/grandTemple.png', upkeep:5 },
};

// Biens distribués par les marchés — consommation PAR JOUR DE JEU (voir market.js).
// Chaque bien consomme 'perHouse' unités par maison et par jour lorsque le besoin
// correspond au palier actuel ou suivant (voir houses.js).
const MARKET_GOODS = [
  { need:'food', resource:'wheat', perHouse:1 },
  { need:'oil',  resource:'oil',   perHouse:1 },
  { need:'wine', resource:'wine',  perHouse:1 },
  { need:'wool', resource:'wool',  perHouse:1 },
];

/* ===================== COMMERCE EXTERIEUR ===================== */
// Biens exportables et leur prix de vente unitaire (drachmes). Une fois par mois,
// chaque comptoir de commerce vend jusqu'à EXPORT_QTY_PER_POST unités de CHAQUE bien
// activé par le joueur (dans la limite du stock disponible). Voir trade.js.
const EXPORT_GOODS = [
  { resource:'wheat',     price:3 },
  { resource:'olives',    price:4 },
  { resource:'grapes',    price:4 },
  { resource:'oil',       price:9 },
  { resource:'wine',      price:12 },
  { resource:'wool',      price:8 },
  { resource:'marble',    price:6 },
  { resource:'sculpture', price:28 },
];
const EXPORT_QTY_PER_POST = 15;

// Biens importables et leur prix d'achat unitaire -- volontairement plus cher que le
// prix de vente du même bien (écart réaliste, évite aussi l'aller-retour export/import
// pour faire du profit sans rien produire). Pensé pour compenser une ressource qu'on ne
// produit pas encore, pas comme méthode d'acquisition principale -> capacité plus faible
// que l'export (IMPORT_QTY_PER_POST < EXPORT_QTY_PER_POST).
const IMPORT_GOODS = [
  { resource:'wheat',     price:5 },
  { resource:'olives',    price:7 },
  { resource:'grapes',    price:7 },
  { resource:'oil',       price:14 },
  { resource:'wine',      price:18 },
  { resource:'wool',      price:13 },
  { resource:'marble',    price:10 },
  { resource:'sculpture', price:42 },
];
const IMPORT_QTY_PER_POST = 12;

/* ===================== CARTE DU MONDE & CITES ===================== */
// À chaque nouvelle partie, on génère WORLD_CITY_COUNT cités voisines : nom + position
// (sur la carte du monde) + profil commercial (ce qu'elles ACHÈTENT = on leur exporte ;
// ce qu'elles VENDENT = on leur importe) + relation diplomatique. Ces mêmes cités
// serviront aussi aux combats (invasions). Voir world.js.
const WORLD_CITY_COUNT = 6;

// Biens échangeables et leur valeur de référence (drachmes/unité). Les prix réels de
// chaque cité dérivent de cette base × un facteur aléatoire propre à la cité, puis sont
// modulés par la relation au moment de la transaction (meilleure relation = on vend plus
// cher et on achète moins cher). Voir world.js (cityExportPrice / cityImportPrice).
const TRADE_GOODS = ['wheat', 'olives', 'grapes', 'marble', 'oil', 'wine', 'wool', 'sculpture'];
const TRADE_BASE_PRICE = {
  wheat: 3, olives: 4, grapes: 4, marble: 6, oil: 9, wine: 12, wool: 8, sculpture: 28,
};

// Effet de la relation sur les prix : à 100 de relation, +20% au prix de vente et −15%
// au prix d'achat ; effet inverse à 0. Linéaire autour de 50 (neutre).
const TRADE_RELATION_EXPORT_BONUS = 0.20;
const TRADE_RELATION_IMPORT_DISCOUNT = 0.15;

/* ===================== MILITAIRE ===================== */
// L'armée se mesure en POINTS de troupe, calculés en temps réel : il faut au moins une
// caserne, puis le potentiel = min(casernes × TROOPS_PER_BARRACKS, population × TROOPS_PER_POP).
// Plus la cité est peuplée, plus l'armée peut être nombreuse -- mais elle coûte un
// entretien mensuel (or + blé) proportionnel. Si l'entretien n'est pas payé, le moral
// chute et les points de combat effectifs baissent. Voir military.js.
const TROOPS_PER_BARRACKS = 30;   // points de troupe soutenus par caserne
const TROOPS_PER_POP = 0.4;       // plafond lié à la population (40 % des habitants)
const ARMY_UPKEEP_GOLD = 1.5;     // drachmes/mois par point de troupe
const ARMY_UPKEEP_WHEAT = 2;      // blé/mois par point de troupe

// Puissance militaire des cités voisines (générée à la création, voir world.js). Sert de
// score adverse lors d'une attaque : on gagne si nos points sont strictement supérieurs.
const WORLD_CITY_BASE_POWER = 45;        // puissance de référence
const TRIBUTE_PER_POWER = 6;             // tribut immédiat (drachmes) par point de puissance vaincue
const TRIBUTE_MONTHLY_PER_POWER = 0.4;   // tribut mensuel versé par une cité conquise
const REPRISAL_CHANCE = 0.5;             // probabilité de représailles après une défaite

// Pool de noms de cités grecques antiques. 6 tirés au hasard (sans doublon) par partie.
const WORLD_CITY_NAMES = [
  'Argos', 'Mycènes', 'Délos', 'Milet', 'Éphèse', 'Rhodes', 'Syracuse', 'Byzance',
  'Pergame', 'Halicarnasse', 'Cnossos', 'Mégare', 'Élis', 'Tirynthe', 'Naxos', 'Samos',
  'Chios', 'Cumes', 'Tarente', 'Massalia', 'Olynthe', 'Abdère', 'Égine', 'Phocée', 'Cyrène',
];

// Couleurs de repli, utilisées tant que le sprite de terrain n'est pas chargé.
const TERRAIN_COLORS = {
  grass:  '#7ea24c',
  wheat:  '#d4b35c',
  marble: '#cfcac0',
  water:  '#3f7ea6',
  sand:   '#d4c4a0',
  forest: '#4a6b38',
  rock:   '#8a8580',
  hill:   '#6d9348',
};

const TERRAIN_SPRITES = {
  grass:  'assets/tiles/grass.png',
  wheat:  'assets/tiles/wheat.png',
  marble: 'assets/tiles/marble.png',
  water:  'assets/tiles/water.png',
  sand:   'assets/tiles/sand.png',
  forest: 'assets/tiles/forest.png',
  rock:   'assets/tiles/rock.png',
  hill:   'assets/tiles/hill.png',
};

const ROAD_SPRITE_PATH = 'assets/tiles/road.png';

const BASE_CAP = { wheat:50, marble:60, sculpture:30, olives:40, oil:40, grapes:40, wine:40, wool:40 };

// Stocks de départ (complément au trésor) — couvrent ~1 jour de consommation d'une petite cité.
const STARTING_RESOURCES = { wheat:30, marble:20, sculpture:2, olives:12, oil:10, grapes:12, wine:6, wool:4 };

/* ===================== NIVEAUX DE MAISON ===================== */
// requires : liste de clés de besoin (voir NEED_CHECKERS dans houses.js).
// route/water/food/oil/wine/wool/religion/health/fire/beauty — voir beauty.js pour le cachet.
// sprite : art réel par niveau (assets/houses/). Le niveau 'domaine' n'a pas encore
// de sprite dédié et réutilise le plus haut niveau disponible (voir render.js).
// Progression : chaque ressource/service est introduit à un palier précis, et le
// palais exige « un peu de tout ». Récap des nouveautés par niveau :
//   decent    -> +eau
//   villa     -> +nourriture
//   domaine   -> +huile, +beauté
//   residence -> +vin, +religion
//   palais    -> +laine, +santé, +protection incendie (donc TOUT : route, eau,
//                 nourriture, huile, vin, laine, religion, santé, beauté, feu)
const HOUSE_LEVELS = [
  { key:'hut',       nameKey:'houseLevel.hut',       population:2,  requires:[], sprite:'assets/houses/hut.png' },
  { key:'house',     nameKey:'houseLevel.house',     population:5,  requires:['route'], sprite:'assets/houses/house.png' },
  { key:'decent',    nameKey:'houseLevel.decent',    population:9,  requires:['route','water'], sprite:'assets/houses/decent.png' },
  { key:'villa',     nameKey:'houseLevel.villa',     population:15, requires:['route','water','food'], sprite:'assets/houses/villa.png' },
  { key:'domaine',   nameKey:'houseLevel.domaine',   population:24, requires:['route','water','food','oil','beauty'] },
  { key:'residence', nameKey:'houseLevel.residence', population:34, requires:['route','water','food','oil','wine','religion','beauty'], sprite:'assets/houses/residence.png' },
  { key:'palais',    nameKey:'houseLevel.palais',    population:48, requires:['route','water','food','oil','wine','wool','religion','health','fire','beauty'], sprite:'assets/houses/palais.png' },
];

/* ===================== EMBELLISSEMENT (CACHET) ===================== */
// Cachet minimal accumulé sur la case d'une maison pour satisfaire le besoin 'beauty'
// (voir beauty.js pour la diffusion, houses.js pour la vérification du besoin).
const BEAUTY_THRESHOLD = 5;

/* ===================== ICONES DE STATUT (au-dessus des maisons) ===================== */
// Voir houses.js (getHouseStatusIcons) et render.js (drawHouseStatusIcons).
const NEED_ICONS = {
  route:    '🛣️',
  water:    '⛲',
  food:     '🍴',
  oil:      '🛢️',
  wine:     '🍷',
  wool:     '🐑',
  religion: '🛕',
  health:   '🤢',
  fire:     '🔥',
  beauty:   '🌲',
};

/* ===================== ECONOMIE — CHAINES & EQUILIBRAGE ===================== */
// Chaînes complètes (matière → transformation → besoin maison / commerce / dieux) :
//   blé      : ferme → marché (nourriture) → armée (entretien mensuel)
//   marbre   : carrière → atelier → sculpture → offrandes, festivals, héros, temples
//   olives   : verger → pressoir → huile → marché (domaine+) → commerce
//   raisin   : vignoble → cave → vin → marché (résidence+) → diplomatie, festivals
//   laine    : bergerie → marché (palais) → commerce · temple Athéna
// Ratios visés (emploi 100 %, impôt neutre, cycle JOURNALIER) :
//   1 ferme ≈ 18 blé/j → ~18 villas nourries · 1 verger + 1 pressoir ≈ 12 huile/j
//   1 vignoble + 1 cave ≈ 12 vin/j · 1 carrière + 1 atelier ≈ 10 sculpture/j
// Marchés : 1 unité/bien/maison/jour. Croissance/émigration : 1 tirage/jour.
// Impôts/entretien/production : chaque tick (~1 s). Commerce/armée : chaque mois.
const STARTING_TREASURY = 1500;
const TAX_PER_POP = 0.25;        // conservé pour compatibilité (non utilisé : voir TAX_BASE_PER_POP)
const ROAD_COST = 5;             // coût de pose d'une case de route (pas un BUILDING_DEFS)
const DEMOLISH_REFUND_RATE = 0.5; // fraction du coût de construction remboursée à la démolition

/* ===================== IMPOTS (BUREAU DES IMPOTS) ===================== */
// Contrairement à l'ancien système (taxe globale fixe sur toute la population),
// seules les maisons DESSERVIES par un bureau des impôts (walker, serviceType='tax')
// paient — voir economy.js. Le taux est réglable par le joueur (panneau Gouvernement),
// et influence trois choses :
//   - collecte    : proportionnelle directe au taux (voir taxCollectionRate)
//   - efficacité  : pénalise la production si le taux est haut (voir taxes.js)
//   - croissance  : ralentit l'évolution des maisons si le taux est haut (voir houses.js)
const TAX_BASE_PER_POP = 0.38;    // drachmes/habitant/tick desservi, AU TAUX MAXIMUM (1.0)
const TAX_RATE_DEFAULT = 0.45;    // taux neutre au démarrage
const TAX_EFFICIENCY_AT_ZERO = 1.15;
const TAX_EFFICIENCY_AT_MAX  = 0.75;
const TAX_GROWTH_CHANCE_AT_ZERO = 0.22;  // probabilité d'évolution PAR JOUR, taux 0
const TAX_GROWTH_CHANCE_AT_MAX  = 0.04;  // probabilité d'évolution PAR JOUR, taux 1

/* ===================== IMMIGRATION / EMIGRATION ===================== */
// Voir migration.js pour la logique (cityAttractiveness, growthChance, emigrationChance).
const GROWTH_FAVOR_INFLUENCE = 0.12;
const EMIGRATION_THRESHOLD = 0.38;
const EMIGRATION_STRENGTH = 0.22;
const MIGRANT_MOVE_EVERY_TICKS = 1;   // vitesse des colons sur la route (voir migrationAgents.js)
// Point d'entrée/sortie fixe au bord sud de la carte (colons qui arrivent et repartent).
const MIGRANT_ENTRY_COL = Math.floor(GRID_COLS / 2);
const MIGRANT_ENTRY_ROW = GRID_ROWS - 1;

/* ===================== TROUPES VISUELLES (CARTE) ===================== */
const TROOPS_NPCS_PER_POWER = 6;      // 1 soldat visible par tranche de 6 pts de puissance
const TROOPS_MOVE_EVERY_TICKS = 1;

/* ===================== INVASIONS ===================== */
const INVASION_MOVE_EVERY_TICKS = 2;
const INVASION_SPAWN_CHANCE = 0.003;
const INVASION_MIN_DAY = 10;

/* ===================== GENERATION DE CARTE PROCEDURALE ===================== */
const MAP_NOISE_SCALE = 0.042;
const MAP_HEIGHT_OCTAVES = 6;
const MAP_RIDGE_STRENGTH = 0.38;
const MAP_DETAIL_STRENGTH = 0.08;
const MAP_WATER_THRESHOLD = 0.24;
const MAP_SAND_THRESHOLD = 0.31;
const MAP_MARBLE_THRESHOLD = 0.76;
const MAP_HILL_THRESHOLD = 0.54;
const MAP_HILL_MAX = 0.64;
const MAP_ROCK_SLOPE = 0.095;
const MAP_FOREST_MOISTURE = 0.56;
const MAP_FOREST_MIN_HEIGHT = 0.34;
const MAP_FOREST_MAX_HEIGHT = 0.58;
const MAP_FOREST_MAX_SLOPE = 0.055;
const MAP_WHEAT_MOISTURE = 0.50;
const MAP_WHEAT_MIN_HEIGHT = 0.30;
const MAP_WHEAT_MAX_HEIGHT = 0.46;
const MAP_FLATTEN_RADIUS = 10;
const MAP_PLAYABLE_ELEVATION = 0.40;

/* ===================== MAINTENANCE (INCENDIES / MALADIES) ===================== */
// Voir maintenance.js. Premiers chiffres, pas encore équilibrés en conditions réelles
// de jeu -- à ajuster une fois que tu auras une vraie ville qui tourne longtemps.
// Une maison NON desservie (fire/health) risque un sinistre à chaque tick ; une maison
// desservie garde un risque résiduel très faible, jamais totalement nul.
const FIRE_CHANCE_UNCOVERED = 0.0006;
const FIRE_CHANCE_COVERED = 0.00004;
const DISEASE_CHANCE_UNCOVERED = 0.0006;
const DISEASE_CHANCE_COVERED = 0.00004;

/* ===================== PALETTES MAISONS PROCEDURALES ===================== */
const HOUSE_WALL_COLORS  = ['#d8c9a3', '#c9b68f', '#bfa77d', '#e3d6b8'];
const HOUSE_ROOF_COLORS  = ['#a8512f', '#8c3f24', '#9c6b3f', '#6f5a4a'];
const HOUSE_TRIM_COLORS  = ['#a8472f', '#5d6b3a', '#7d6b4a'];
const HOUSE_ROOF_SHAPES  = ['pyramid', 'dome', 'flat'];

/* ===================== SPRITES PERSONNAGES (atlas 3×4, cf. tools/slice_walker_sheets.py) ===================== */
const CHARACTER_FRAME_SIZE = 96;
const CHARACTER_FRAMES = 3;
const CHARACTER_DIRECTION_ROWS = { up: 0, left: 1, down: 2, right: 3 };
const CHARACTER_DISPLAY_SIZE = 44;
const CHARACTER_ANIM_FRAME_MS = 120;

const SERVICE_WALKER_SPRITES = {
  water:    'assets/characters/walkers/water.png',
  market:   'assets/characters/walkers/market.png',
  religion: 'assets/characters/walkers/religion.png',
  health:   'assets/characters/walkers/health.png',
  tax:      'assets/characters/walkers/tax.png',
  fire:     'assets/characters/walkers/fire.png',
};

// Repli générique si un atlas métier n'est pas encore découpé.
const WALKER_SPRITE_PATH = 'assets/characters/walkers/water.png';
const WALKER_FRAME_SIZE = CHARACTER_FRAME_SIZE;
const WALKER_FRAMES_PER_CYCLE = CHARACTER_FRAMES;
const WALKER_DIRECTION_ROWS = CHARACTER_DIRECTION_ROWS;
const WALKER_ANIM_FRAME_MS = CHARACTER_ANIM_FRAME_MS;
const WALKER_DISPLAY_SIZE = CHARACTER_DISPLAY_SIZE;

/* ===================== MYTHOLOGIE ===================== */
const FAVOR_MAX = 100;
const FAVOR_DECAY_PER_TICK = 0.06;
const FAVOR_OFFERING_COST = { sculpture: 5 };
const FAVOR_OFFERING_GAIN = 15;
const FAVOR_BLESSING_THRESHOLD = 80;       // au-dessus : bénédiction possible
const FAVOR_CATASTROPHE_THRESHOLD = 20;    // en-dessous : catastrophe possible
const FAVOR_EVENT_CHANCE_PER_TICK = 0.03;  // 3%/tick une fois le seuil franchi
const PRODUCTION_BOOST_MULTIPLIER = 1.5;
const PRODUCTION_PENALTY_MULTIPLIER = 0.5;
const PRODUCTION_EFFECT_DURATION_TICKS = 20; // ~20 secondes

// Temples monumentaux : chaque dieu confère un avantage passif tant que son temple
// existe (alliance choisie à la construction). Un seul temple par dieu dans la cité.
const MONUMENT_FOOTPRINT = 2;
const GODS = [
  { key:'demeter',  icon:'🌾', benefit:'wheatMax',       cost:450, costResources:{ marble:40, wheat:80 } },
  { key:'zeus',     icon:'⚡', benefit:'favorShield',   cost:800, costResources:{ marble:60, sculpture:30 } },
  { key:'athena',   icon:'🦉', benefit:'military',      cost:700, costResources:{ marble:55, wool:40 } },
  { key:'dionysos', icon:'🍷', benefit:'wineBoost',     cost:500, costResources:{ marble:35, wine:40, grapes:50 } },
  { key:'poseidon', icon:'🔱', benefit:'tradeBoost',    cost:550, costResources:{ marble:45, wheat:60 } },
  { key:'apollo',   icon:'☀️', benefit:'healthBlessing', cost:650, costResources:{ marble:50, sculpture:20 } },
];
const GOD_MILITARY_BONUS = 30;
const GOD_TRADE_BONUS = 0.5;           // +50 % revenus export
const GOD_WINE_MULTIPLIER = 2;
const GOD_FAVOR_FLOOR = 65;            // plancher de faveur (Zeus)
const GOD_APOLLO_FAVOR_MONTHLY = 15;
const GOD_APOLLO_DISEASE_MULT = 0.25;  // maladies ×0.25 avec temple d'Apollon (75 % de réduction)
const GOD_MOVE_EVERY_TICKS = 12; // promenade paisible dans la cité (plus lent qu'un monstre)

/* ===================== OBJECTIFS DE MISSION ===================== */
// metric : clé vers OBJECTIVE_METRICS (voir objectives.js), pas une fonction directement —
// même principe que NEED_CHECKERS, pour garder ce fichier en pure donnée.
const OBJECTIVES = [
  { key:'population',    nameKey:'objective.population',    metric:'population',    target:50 },
  { key:'wheatProduced',  nameKey:'objective.wheatProduced',  metric:'wheatProduced',  target:100 },
  { key:'villa',          nameKey:'objective.villa',          metric:'villa',          target:1 },
  { key:'favor',          nameKey:'objective.favor',          metric:'favor',          target:80 },
];

/* ===================== DEFAITE ===================== */
// Deux conditions, vérifiées chaque tick (voir defeat.js) -- un sinistre temporaire
// (un creux de population pendant un incendie, ou un trésor brièvement négatif) ne
// déclenche pas la défaite : il faut que ça dure plusieurs ticks de suite.
const DEFEAT_POPULATION_TICKS = 10;  // population à 0 pendant 10 ticks d'affilée
const DEFEAT_BANKRUPTCY_TICKS = 30;  // trésor négatif pendant 30 ticks d'affilée

/* ===================== FESTIVALS ===================== */
// Même principe que l'offrande (mythology.js) : action joueur, coûte des ressources,
// effet temporaire -- ici un bonus de croissance/réduction d'émigration (voir
// migration.js) plutôt qu'un nouveau stat "bonheur" séparé.
const FESTIVAL_COST = { wine: 8, sculpture: 4 };
const FESTIVAL_FAVOR_GAIN = 18;
const FESTIVAL_DURATION_TICKS = 50;
const FESTIVAL_GROWTH_BONUS = 0.10;

/* ===================== CALENDRIER (mois attiques) ===================== */
// Dérivé uniquement de DEBUG.tickCount (voir calendar.js) -- aucun état séparé à
// sauvegarder, donc aucun risque de désynchronisation avec une sauvegarde existante.
const DAY_DURATION_TICKS = 10;  // 1 jour = 10 ticks = 10 secondes
const DAYS_PER_MONTH = 7;       // 1 mois = 7 jours (~1 min 10s) -> 1 an = 84 jours (~14 min)

// Les 12 mois du calendrier attique (athénien), dans leur ordre traditionnel
// (l'année commence après le solstice d'été). Regroupés par saison pour l'icône.
const MONTHS = [
  { key:'hecatombaion',  season:'summer' },
  { key:'metageitnion',  season:'summer' },
  { key:'boedromion',    season:'summer' },
  { key:'pyanepsion',    season:'autumn' },
  { key:'maimakterion',  season:'autumn' },
  { key:'poseideon',     season:'autumn' },
  { key:'gamelion',      season:'winter' },
  { key:'anthesterion',  season:'winter' },
  { key:'elaphebolion',  season:'winter' },
  { key:'mounichion',    season:'spring' },
  { key:'thargelion',    season:'spring' },
  { key:'skirophorion',  season:'spring' },
];

const SEASON_ICONS = { summer:'☀️', autumn:'🍂', winter:'❄️', spring:'🌸' };

/* ===================== DIPLOMATIE ===================== */
// Cités-États voisines avec lesquelles Olympos entretient une relation (0-100).
// Un événement périodique propose un choix au joueur (voir diplomacy.js) dont les
// conséquences modifient trésor / ressources / faveur ET la relation avec la cité.
const DIPLO_CITIES = [
  { key: 'sparta',  icon: '🛡️' },
  { key: 'corinth', icon: '⚓' },
  { key: 'thebes',  icon: '🦅' },
];

const DIPLO_RELATION_START = 50;   // relation de départ avec chaque cité
const DIPLO_RELATION_MIN = 0;
const DIPLO_RELATION_MAX = 100;
const DIPLO_EVENT_INTERVAL_DAYS = 12; // un événement tous les ~12 jours de jeu
const DIPLO_FIRST_EVENT_DAY = 8;      // pas d'événement avant ce jour (laisse démarrer)

// Seuils de qualification d'une relation (libellé + couleur dans le panneau).
const DIPLO_ALLY_THRESHOLD = 66;
const DIPLO_HOSTILE_THRESHOLD = 34;

// Table d'événements. Pour chaque événement :
//   minRel/maxRel : plage de relation de la cité où l'événement peut se produire
//   weight        : poids du tirage aléatoire parmi les événements éligibles
//   vars          : valeurs injectées dans les textes i18n (titre/corps/résultat)
//   choices[]     : { key, type, requires?, effects, result, resultType }
//     requires : conditions pour activer le bouton ({ treasury, resources:{} })
//     effects  : deltas appliqués au choix ({ treasury, favor, relation, resources:{} })
//     result   : suffixe de clé i18n 'diplomacy.result.<result>' (notification)
const DIPLO_EVENTS = [
  {
    key: 'gift', minRel: 55, maxRel: 100, weight: 3,
    vars: { amount: 150 },
    choices: [
      { key: 'accept', type: 'good',    effects: { treasury: 150, relation: 4 },  result: 'giftAccepted',  resultType: 'good' },
      { key: 'decline', type: 'neutral', effects: { relation: 10 },                result: 'giftDeclined',  resultType: 'good' },
    ],
  },
  {
    key: 'alliance', minRel: 60, maxRel: 100, weight: 2,
    vars: { qty: 12, res: 'wine' },
    choices: [
      { key: 'accept', type: 'primary', requires: { resources: { wine: 12 } }, effects: { resources: { wine: -12 }, relation: 18, favor: 5 }, result: 'allianceSealed', resultType: 'good' },
      { key: 'decline', type: 'neutral', effects: { relation: -8 }, result: 'allianceDeclined', resultType: 'bad' },
    ],
  },
  {
    key: 'tradeDeal', minRel: 0, maxRel: 100, weight: 3,
    vars: { qty: 15, res: 'marble', gold: 280 },
    choices: [
      { key: 'accept', type: 'good', requires: { resources: { marble: 15 } }, effects: { resources: { marble: -15 }, treasury: 280, relation: 6 }, result: 'tradeAccepted', resultType: 'good' },
      { key: 'decline', type: 'neutral', effects: { relation: -3 }, result: 'tradeDeclined', resultType: 'bad' },
    ],
  },
  {
    key: 'tribute', minRel: 0, maxRel: 60, weight: 3,
    vars: { amount: 220 },
    choices: [
      { key: 'pay', type: 'primary', requires: { treasury: 220 }, effects: { treasury: -220, relation: 12 }, result: 'tributePaid', resultType: 'good' },
      { key: 'refuse', type: 'danger', effects: { relation: -15 }, result: 'tributeRefused', resultType: 'bad' },
    ],
  },
  {
    key: 'raidThreat', minRel: 0, maxRel: 38, weight: 2,
    vars: { amount: 160, loss: 320 },
    choices: [
      { key: 'pay', type: 'primary', requires: { treasury: 160 }, effects: { treasury: -160, relation: 10 }, result: 'raidAppeased', resultType: 'good' },
      { key: 'refuse', type: 'danger', effects: { treasury: -320, relation: -8, resources: { wheat: -15 } }, result: 'raidHappened', resultType: 'bad' },
    ],
  },
];

/* ===================== MONSTRES & HEROS ===================== */
// Sprites : comfy_batch_generate_characters.py → tools/slice_walker_sheets.py
//   python tools/slice_walker_sheets.py --from sprites_out/characters/monsters --to assets/characters/monsters --background green
//   python tools/slice_walker_sheets.py --from sprites_out/characters/heroes --to assets/characters/heroes --background green
const MONSTER_TYPES = [
  { key: 'medusa',   icon: '🐍', sprite: 'assets/characters/monsters/medusa.png',   heroKey: 'perseus',  hp: 5, moveEvery: 2, attackChance: 0.16 },
  { key: 'hydra',    icon: '🐉', sprite: 'assets/characters/monsters/hydra.png',    heroKey: 'heracles', hp: 10, moveEvery: 3, attackChance: 0.20 },
  { key: 'minotaur', icon: '🐂', sprite: 'assets/characters/monsters/minotaur.png', heroKey: 'theseus',  hp: 8, moveEvery: 2, attackChance: 0.22 },
  { key: 'cyclops',  icon: '👁️', sprite: 'assets/characters/monsters/cyclops.png',  heroKey: 'ulysses',  hp: 7, moveEvery: 2, attackChance: 0.18 },
  { key: 'cerberus', icon: '🐺', sprite: 'assets/characters/monsters/cerberus.png', heroKey: 'orpheus',  hp: 9, moveEvery: 2, attackChance: 0.20 },
];

// Un héros par monstre — seul le héros désigné est invoqué et peut le vaincre efficacement.
const HERO_TYPES = [
  { key: 'perseus',  icon: '🛡️', sprite: 'assets/characters/heroes/perseus.png',  damage: 2, moveEvery: 1 },
  { key: 'heracles', icon: '💪', sprite: 'assets/characters/heroes/heracles.png', damage: 3, moveEvery: 1 },
  { key: 'theseus',  icon: '⚔️', sprite: 'assets/characters/heroes/theseus.png',  damage: 2, moveEvery: 1 },
  { key: 'ulysses',  icon: '🏹', sprite: 'assets/characters/heroes/ulysses.png',  damage: 2, moveEvery: 1 },
  { key: 'orpheus',  icon: '🎵', sprite: 'assets/characters/heroes/orpheus.png',  damage: 2, moveEvery: 1 },
];

const HERO_VS_MONSTER_DAMAGE_MULT = 2;   // repli si combat non désigné (debug)
const HERO_WRONG_MATCH_DAMAGE_MULT = 0.4;

const MONSTER_HP = 6;                 // repli si type sans hp explicite
const MONSTER_MOVE_EVERY_TICKS = 2;
const MONSTER_ATTACK_CHANCE = 0.18;
const MONSTER_SPAWN_CHANCE = 0.004;
const MONSTER_MIN_DAY = 6;

const HERO_MOVE_EVERY_TICKS = 1;
const HERO_DAMAGE = 2;
const HERO_SUMMON_COST = { sculpture: 6, oil: 8, wine: 8 };
