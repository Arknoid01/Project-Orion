# Olympos — Brief de reprise de projet

Document de passation pour continuer le développement dans un autre environnement
(Cursor). Écrit pour qu'une IA de code puisse reprendre sans relire tout l'historique.

## Identité du projet

- **Nom** : Olympos (le repo s'appelle `Project-Orion`, nom historique, pas changé)
- **Concept** : city-builder isométrique simplifié façon *Zeus: Master of Olympus* /
  *Caesar III*, en HTML/JS pur, hébergé sur GitHub Pages
- **Repo** : `github.com/Arknoid01/Project-Orion`
- **Live** : `https://arknoid01.github.io/Project-Orion/`
- **Stade actuel** : prototype fonctionnel, les 8 phases du plan initial sont
  implémentées et testées (grille, maisons, walker, nourriture, mythologie,
  objectifs, sauvegarde, mobile)

## Contraintes techniques à respecter absolument

1. **Pas de build, pas de bundler, pas de npm en prod.** Que des balises
   `<script src="...">` classiques chargées dans un ordre précis (voir
   `index.html`). Pas de modules ES6 (`type="module"`) — ils cassent en
   ouverture `file://` directe, et la cohérence du projet en dépend.
2. **Tous les fichiers JS partagent le même scope global.** Pas d'`import`/
   `export`. Une fonction définie dans un fichier peut être appelée depuis un
   fichier chargé *avant* elle, **tant que l'appel est différé** (dans le corps
   d'une autre fonction, pas exécuté immédiatement au chargement du script).
   Piège classique : `element.addEventListener('click', maFonction)` où
   `maFonction` est définie plus tard → `ReferenceError` immédiat. Toujours
   écrire `addEventListener('click', () => maFonction())` dans ce cas.
3. **i18n obligatoire** : aucun texte affiché au joueur ne doit être écrit en
   dur. Toujours passer par `t('cle.de.traduction')` (voir `js/i18n.js`), et
   ajouter la clé en FR **et** EN à chaque fois (un script de test vérifie la
   symétrie des deux dictionnaires).
4. **Mobile-first réel** : le jeu est testé et joué sur téléphone (Android,
   Brave/Chrome) via GitHub Pages, pas juste sur PC. La balise
   `<meta name="viewport">` est indispensable (sans elle, aucune media query
   ne se déclenche). Utiliser `dvh` plutôt que `vh` pour les hauteurs liées au
   viewport mobile.
5. **Sauvegarde via `localStorage`**, clé `olympos_save_v1` — volontairement
   spécifique car `localStorage` est partagé par tout le domaine
   `arknoid01.github.io`, pas juste ce projet.

## Structure des fichiers

```
index.html
css/style.css
assets/buildings/{farm,granary}.png       (sprites réels générés via ComfyUI)
assets/characters/walk.png                (sprite LPC, cycle de marche)
js/
  debug.js       → logger visible à l'écran + capture d'erreurs globales (chargé en premier)
  i18n.js        → dictionnaire FR/EN + fonction t()
  config.js      → toutes les constantes/données (BUILDING_DEFS, HOUSE_LEVELS, OBJECTIVES...)
  procgen.js     → RNG déterministe (mulberry32 + hashSeed) pour la variété procédurale
  grid.js        → état de la grille + maths isométriques (tileCenter, screenToTile)
  houses.js      → évolution des maisons (niveaux, NEED_CHECKERS)
  walkers.js     → système de patrouille "triché" (voir plus bas)
  market.js      → distribution de nourriture (consomme le blé réel)
  mythology.js   → faveur divine, offrandes, bénédictions/catastrophes
  objectives.js  → suivi des objectifs de victoire
  save.js        → sauvegarde/chargement localStorage
  loop.js        → boucle d'affichage 60fps (requestAnimationFrame), séparée du tick
  render.js      → tout le dessin canvas (tuiles, bâtiments, maisons procédurales, walkers)
  production.js  → ressources, tick principal (orchestre tout le reste)
  ui.js          → état d'interaction (sélection, modes), événements souris/tactile, tiroir mobile
  main.js        → orchestration finale, init, intervals
```

## Boucle de jeu

- Grille 14×14, tuile iso 64×32px
- **Deux boucles séparées** : simulation (`tick()`, 1×/seconde, `setInterval`) et
  affichage (`render()`, 60fps via `requestAnimationFrame`, dans `loop.js`) —
  séparation nécessaire pour l'animation fluide des walkers (interpolation de
  position entre deux ticks)
- Bâtiments définis dans `BUILDING_DEFS` (config.js) : farm, quarry, granary,
  workshop, fountain, market, maison
- Routes = simple flag `hasRoad` sur la cellule, **pas** un bâtiment
- Maisons : niveaux `hut → house → decent → villa`, chaque niveau ajoute un
  besoin (`route`, `water`, `food`, `beauty` — ce dernier est un **stub non
  câblé**, toujours faux, prévu pour une future phase embellissement)

## Le système walker — "triché", pas du vrai pathfinding

Point le plus important à comprendre avant de toucher à ce système :

- Pas de vraie IA de déplacement. Chaque bâtiment de service (fontaine,
  marché) a un **trajet de patrouille calculé une seule fois** (DFS le long
  des routes connectées, bidirectionnel si le bâtiment a 2 sorties)
- La **couverture des maisons** (qui est desservi) est calculée en même temps
  que le trajet, capacité limitée — **indépendante** de la position actuelle
  du walker
- Le déplacement visuel (sprite LPC qui marche, aller-retour sur le trajet)
  est **purement cosmétique**, découplé de la couverture réelle
- Une **borne de blocage** (`patrolBlock` sur une case route) permet au joueur
  de forcer un demi-tour à un carrefour
- Tout est recalculé (`recomputeAllWalkers()`) après chaque modification de
  route/bâtiment/borne — pas d'optimisation incrémentale, le coût est
  négligeable sur une grille 14×14

## Conventions établies

- **Données séparées de la logique** : `config.js` ne contient que des
  structures de données (objets/tableaux), jamais de fonctions avec effets de
  bord. La logique vit dans les fichiers dédiés (`houses.js`, `walkers.js`...)
- **RNG déterministe par position** : toute variété visuelle procédurale
  (apparence des maisons) utilise `hashSeed(col, row)` + `mulberry32` pour
  rester stable entre deux rendus, jamais `Math.random()` directement pour de
  l'affichage
- **Logging systématique** : chaque transition d'état importante (construction,
  démolition, évolution de maison, événement divin...) passe par `debugInfo`/
  `debugWarn`/`debugError`, visibles dans le panneau debug à l'écran (pas
  seulement la console — indispensable pour déboguer sur mobile sans
  brancher le téléphone)
- **Sprites réels avec repli procédural** : chaque bâtiment qui a un vrai PNG
  généré (`sprite` dans `BUILDING_DEFS`) l'utilise ; sinon `drawBuilding`
  dessine une forme géométrique de secours. Aucun crash si un sprite manque.

## Pipeline de génération d'assets (semi-automatisé, en pause)

- Guides géométriques générés en Python/PIL (silhouette + perspective figées)
- Envoyés à ComfyUI (local ou RunPod) via un script d'automatisation
  (`comfy_batch_generate.py`, pas dans le repo du jeu — outil externe) en
  img2img, denoise élevé (~0.8) car les guides sont trop "propres" pour un
  denoise modéré
- Modèle utilisé : Flux (GGUF quantifié, contrainte VRAM 6 Go) + LoRA de style
  "villa méditerranéenne isométrique"
- Détourage par chroma-key du fond blanc, redimensionnement ~144px
- **Seuls `farm.png` et `granary.png` existent actuellement.** Fontaine,
  marché, et plus de variété de maisons restent à générer — explicitement mis
  en pause pour avancer sur les systèmes plutôt que l'art

## Pièges connus / leçons apprises

1. **`?v=N` en fin d'URL** pour casser le cache CDN de GitHub Pages après un
   push (le cache peut tenir ~10 min, parfois plus)
2. **GitHub Pages a eu un bug ponctuel** "Multiple artifacts named
   github-pages" qui bloquait tout déploiement — résolu en relançant le
   workflow (onglet Actions → Re-run) ou via un commit bidon
3. **Toujours remplacer le dossier complet** lors d'un déploiement manuel
   (upload fichier par fichier sur GitHub) plutôt que les fichiers
   "censés avoir changé" — source de plusieurs bugs de synchronisation
4. La balise `viewport` manquante a cassé silencieusement toutes les media
   queries mobiles pendant plusieurs tours de debug — à vérifier en premier
   sur tout souci d'affichage responsive
5. `localStorage` ne fonctionne pas sur origine `file://` dans certains
   outils de test (jsdom) — fonctionne normalement en `https://`

## Pistes pour la suite (non tranchées)

- Reprendre la génération d'assets (fontaine, marché, variété de maisons)
- Nouvelles chaînes de production (huile, vin, laine, bois, bronze — présentes
  dans le brainstorm initial, pas implémentées)
- Câbler le besoin `beauty` (statues/jardins) à un 5e niveau de maison
- Étendre la mythologie (plusieurs dieux distincts plutôt qu'un effet
  générique unique)
- Explicitement **hors scope** pour l'instant (décision déjà prise) : armée,
  invasions, carte du monde/diplomatie, campagne à scénarios multiples — jugés
  trop lourds pour un solo dev sur ce projet
