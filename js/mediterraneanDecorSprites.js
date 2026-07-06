// Genere par tools/slice_tree_pack_sheet.py — ne pas editer a la main.
// Arbres : tree_pack_* | Buissons : bush_pack_sheet (grass_prop_*)
const MEDITERRANEAN_TREE_SPRITES = [
  'assets/iso_nature/tree_pack_00.png?v=16',
  'assets/iso_nature/tree_pack_01.png?v=16',
  'assets/iso_nature/tree_pack_02.png?v=16',
  'assets/iso_nature/tree_pack_03.png?v=16',
  'assets/iso_nature/tree_pack_04.png?v=16',
  'assets/iso_nature/tree_pack_05.png?v=16',
  'assets/iso_nature/tree_pack_06.png?v=16',
  'assets/iso_nature/tree_pack_07.png?v=16',
  'assets/iso_nature/tree_pack_08.png?v=16',
  'assets/iso_nature/tree_pack_09.png?v=16',
  'assets/iso_nature/tree_pack_10.png?v=15',
  'assets/iso_nature/tree_pack_11.png?v=15',
  'assets/iso_nature/tree_pack_12.png?v=15',
  'assets/iso_nature/tree_pack_13.png?v=15',
  'assets/iso_nature/tree_pack_14.png?v=15',
  'assets/iso_nature/tree_pack_15.png?v=15',
  'assets/iso_nature/tree_pack_16.png?v=15',
];

const MEDITERRANEAN_PROP_SPRITES = [
  'assets/iso_nature/grass_prop_00.png?v=23',
  'assets/iso_nature/grass_prop_01.png?v=23',
  'assets/iso_nature/grass_prop_02.png?v=23',
  'assets/iso_nature/grass_prop_03.png?v=23',
  'assets/iso_nature/grass_prop_04.png?v=23',
  'assets/iso_nature/grass_prop_05.png?v=23',
  'assets/iso_nature/grass_prop_06.png?v=23',
  'assets/iso_nature/grass_prop_07.png?v=23',
  'assets/iso_nature/grass_prop_08.png?v=23',
  'assets/iso_nature/grass_prop_09.png?v=23',
  'assets/iso_nature/grass_prop_10.png?v=23',
  'assets/iso_nature/grass_prop_11.png?v=23',
  'assets/iso_nature/grass_prop_12.png?v=23',
  'assets/iso_nature/grass_prop_13.png?v=23',
  'assets/iso_nature/grass_prop_14.png?v=23',
  'assets/iso_nature/grass_prop_15.png?v=23',
  'assets/iso_nature/grass_prop_16.png?v=23',
  'assets/iso_nature/grass_prop_17.png?v=23',
  'assets/iso_nature/grass_prop_18.png?v=23',
  'assets/iso_nature/grass_prop_19.png?v=23',
  'assets/iso_nature/grass_prop_20.png?v=23',
  'assets/iso_nature/grass_prop_21.png?v=23',
  'assets/iso_nature/grass_prop_22.png?v=23',
  'assets/iso_nature/grass_prop_23.png?v=23',
  'assets/iso_nature/grass_prop_24.png?v=23',
  'assets/iso_nature/grass_prop_25.png?v=23',
  'assets/iso_nature/grass_prop_26.png?v=23',
  'assets/iso_nature/grass_prop_27.png?v=23',
  'assets/iso_nature/grass_prop_28.png?v=23',
  'assets/iso_nature/grass_prop_29.png?v=23',
  'assets/iso_nature/grass_prop_30.png?v=23',
  'assets/iso_nature/grass_prop_31.png?v=23',
  'assets/iso_nature/grass_prop_32.png?v=23',
  'assets/iso_nature/grass_prop_33.png?v=23',
  'assets/iso_nature/grass_prop_34.png?v=23',
];

// Indices : 0-2+10-16 vivants forêt, 3-4 exclus, 5-7 morts, 8-9 palmiers sable, 14-16 cyprès
const MEDITERRANEAN_TREE_FOREST_INDICES = [0, 1, 2, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16];
const MEDITERRANEAN_TREE_PALM_INDICES = [8, 9];
const MEDITERRANEAN_TREE_CYPRESS_INDICES = [14, 15, 16];

const MEDITERRANEAN_TREE_VARIANT_WEIGHTS = [
  1.35,
  1.25,
  1.15,
  1.2,
  1.0,
  0.1,
  0.08,
  0.06,
  0.85,
  0.85,
  1.18,
  1.14,
  1.12,
  1.1,
  0.58,
  0.55,
  0.52,
];

const MEDITERRANEAN_TREE_VARIANT_SIZE_MUL = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1,
  0.56, 0.54, 0.56,
];

const MEDITERRANEAN_HILL_ROCK_SPRITES = [
  'assets/iso_nature/hill_rock_00.png?v=1',
  'assets/iso_nature/hill_rock_01.png?v=1',
  'assets/iso_nature/hill_rock_02.png?v=1',
  'assets/iso_nature/hill_rock_03.png?v=1',
  'assets/iso_nature/hill_rock_04.png?v=1',
  'assets/iso_nature/hill_rock_05.png?v=1',
  'assets/iso_nature/hill_rock_06.png?v=1',
  'assets/iso_nature/hill_rock_07.png?v=1',
  'assets/iso_nature/hill_rock_08.png?v=1',
  'assets/iso_nature/hill_rock_09.png?v=1',
];

const MEDITERRANEAN_HILL_ROCK_VARIANT_WEIGHTS = [
  1.0,
  0.88,
  0.92,
  0.88,
  1.22,
  1.18,
  1.22,
  1.18,
  0.52,
  0.48,
];

const MEDITERRANEAN_HILL_ROCK_VARIANT_SIZE_MUL = [0.52, 0.52, 0.52, 0.52, 0.28, 0.26, 0.28, 0.26, 0.92, 0.90];
