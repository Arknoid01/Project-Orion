# Migration vers la nouvelle interface — suivi de progression

Document de passation pour la migration vers l'interface "Observateur grec moderne"
(fichier original : `olympos_ui_titles_cross_fixed.html`). Projet découpé en phases,
chacune testée avant de passer à la suivante.

## Décision technique clé (à connaître avant de continuer)

**Tout le code JS du moteur de jeu est maintenant défensif sur l'accès au DOM.**
Chaque fonction qui lit/écrit un élément HTML vérifie d'abord qu'il existe
(`if (!el) return;` ou l'utilitaire `on(id, event, handler)` / `setText(id, value)`
dans `ui.js`/`production.js`). Conséquence pratique : le moteur de jeu **ne plante
jamais**, peu importe quelle page HTML l'entoure — un élément manquant est juste
ignoré silencieusement (avec un log debug). Ça veut dire qu'on peut ajouter les
morceaux de la nouvelle interface progressivement, phase par phase, sans jamais
risquer de tout casser en cours de route.

**Important pour la suite** : si tu (ou une autre IA) ajoutes une nouvelle fonction
qui touche au DOM, suis ce même réflexe défensif. C'est devenu la norme du projet.

## ✅ Phase 1 — Carte réelle + zoom + HUD de base (FAIT, testé)

- `index.html` est désormais TA nouvelle interface (`olympos_ui_titles_cross_fixed.html`
  copié puis modifié), plus l'ancienne version. L'ancien `css/style.css` séparé
  n'est plus utilisé par cette page (tout le style de la nouvelle interface est
  inline dans le `<style>` du fichier) — garde-le si tu veux un jour comparer,
  mais il n'a plus d'effet ici.
- `<main class="map" id="canvasWrap">` réutilise ta zone carte existante, mais sert
  maintenant de fenêtre de défilement pour le **vrai** `<canvas id="gameCanvas">`
  (la grille isométrique 20×20 réelle, pas une image décorative)
- Les `.house` / `.mapObj` (farmObj/walkerObj/roadObj) factices ont été retirés du
  HTML (le CSS associé reste en place, inoffensif, au cas où tu veuilles le réutiliser
  ailleurs)
- Les pseudo-éléments décoratifs `.map::before`/`::after` sont neutralisés (sinon ils
  se dessinaient par-dessus le vrai canvas)
- Zoom : tes boutons ＋/− dans `.floatingTools` appellent maintenant les vraies
  fonctions `zoomIn()`/`zoomOut()` (avant : `mock(...)`). Pincement à deux doigts et
  molette fonctionnent aussi (déjà gérés par `zoom.js`, qui cible `#canvasWrap`)
- HUD : les 3 pastilles 🪙👥🌾 affichent maintenant le vrai trésor/population/blé,
  rafraîchies à chaque tick (nouveau fichier `js/hud.js`, fonction `renderHud()`).
  La pastille 📅 affiche le vrai mois/jour du calendrier attique
- Le bouton "💾 Sauvegarder" du menu (`callGameAction('saveGame')`) appelle déjà la
  vraie fonction — ton mécanisme `callGameAction` le permettait nativement, rien à
  changer là-dessus. Pareil pour "📂 Charger"
- `#notification` ajouté (toasts), stylé dans ton esprit verre/or, pour que
  `showNotification()` (utilisé par mythologie/festivals/commerce/diplomatie/etc.)
  ait un endroit où s'afficher

**Limite connue de cette phase** : on ne peut pas encore *construire* via ta nouvelle
interface (le catalogue `#buildPanel`/`#quickBuild` affiche encore des cartes
d'exemple en dur, pas branchées sur `BUILDING_DEFS`). Cliquer sur la carte ne fait
donc rien d'utile pour l'instant, sauf survoler (le surlignage de case fonctionne).

## ✅ Phase 2 — Catalogue de construction réel (FAIT, testé)

- Nouvelles fonctions canoniques dans `ui.js` : `selectBuilding(key)`, `selectRoadMode()`,
  `selectBlockMode()`, `selectDemolishMode()`, `updateSelectedBuildPill()` — utilisées
  À LA FOIS par l'ancienne interface (boutons `#roadBtn` etc., `buildPalette()`) ET la
  nouvelle (`callGameAction('selectBuilding','farm')`, déjà présent dans ton HTML pour
  chaque bâtiment de `#quickBuild`) : une seule logique, pas de duplication
- `BUILDING_DEFS` manquant pour une clé (ex. `barracks`, Guerre pas encore construite) :
  notification "pas encore disponible" au lieu de planter — tu peux laisser tes cartes
  Armée en place, elles ne feront juste rien jusqu'à ce que ce système existe
- `setSelectedBuildLabel()` (ton code) affiche maintenant le vrai nom traduit
  (`t(BUILDING_DEFS[arg].name)`) au lieu de la clé brute (`farm`)
- `selectBuildMock()` (les cartes détaillées de `#buildPanel`) déclenche maintenant
  réellement l'action via `callGameAction` au lieu de juste afficher un texte d'info
  — avant, cliquer une carte là-bas ne sélectionnait rien pour de vrai
- Testé de bout en bout : sélection via une carte → fermeture du panneau → clic sur
  le canvas → bâtiment réellement construit, coût réellement déduit

**Limite connue** : les boutons `openTradePanel`, `openArmyPanel`, `launchAttack`
(visibles dans `#quickBuild`) n'ont pas encore de fonction réelle — `callGameAction`
les laisse retomber sur son mode "hook mock" sans planter. Armée = pas construit du
tout encore ; ouvrir le commerce dans l'observateur = Phase 3.

## ✅ Phase 3 — Observateur avec vraies données (FAIT, testé)

- Nouveau fichier `js/observer.js` : génère les données réelles de `#observerPanel`
  (format `{title, tiles, actions}` attendu par `setObserverTiles()`, déjà dans ton
  script) à partir de l'état du jeu -- maison (niveau, population, besoins, risques
  incendie/maladie/émigration), bâtiment (production, service, commerce...), ou case
  vide/route
- `openTileObserver(col, row)` est appelé depuis le clic sur le canvas (`ui.js`)
  **seulement si aucun mode n'est actif** (pas de bâtiment sélectionné, pas en train
  de poser une route/démolir/borne) -- sinon ça ouvrirait l'observateur à chaque
  pose de bâtiment, ce qui casserait le flux de construction
- `openCityManagement()` (bouton "🏛️ Gestion de la ville" du menu) utilise
  maintenant `buildCityObserverData()` : vrai trésor, vraie population, vraie
  faveur, vrai taux d'imposition, vraies ressources, vrais objectifs -- plus de
  chiffres en dur
- `OBSERVER_DATA` (mock) et `openObjectObserver()` restent dans le fichier mais ne
  sont plus appelés par rien (les anciens boutons factices qui les déclenchaient ont
  été retirés en Phase 1) -- code mort inoffensif, à supprimer un jour si tu veux
  faire le ménage, pas urgent

**Limite connue** : `openTradePanel`, `openArmyPanel`, `launchAttack` (cartes du
catalogue) n'ouvrent toujours pas l'observateur sur le commerce/l'armée
spécifiquement -- pour l'instant seule la case cliquée ou "Gestion de la ville"
ouvrent l'observateur. Pourrait être une extension naturelle de la Phase 4
(ex: `openTradePanel` pourrait appeler `openTileObserver` sur le comptoir le plus
proche, ou un futur `buildTradeObserverData()` dédié).

## ✅ Phase 4 — Panneau debug + vérifications (FAIT, testé)

- `#debugPanel` ajouté (icône 🐛 dans `.floatingTools`, à côté du zoom) -- volontairement
  **hors** du système `.panel`/`closePanels()` de l'observateur, pour qu'un outil de
  diagnostic reste accessible peu importe ce qu'un autre panneau fait. Affiche le
  vrai état (tick, ressources, sélection) et le vrai journal (`debugInfo`/`debugWarn`/
  `debugError`), exactement comme avant
- Icônes de statut des maisons (🔥🤢🍴⛲🌲 au-dessus des maisons) : vérifiées, toujours
  fonctionnelles -- c'est un rendu canvas pur (`render.js`), indépendant de la
  page HTML autour, donc rien à changer là-dessus

**Décisions volontairement reportées (à la demande, pas par oubli)** :
- **Pas de pastilles HUD supplémentaires** (faveur, marbre, sculptures...). Le HUD
  (`.hud`) n'a pas de `flex-wrap`/`overflow` -- en ajouter sans y toucher risquait de
  recréer le bug de débordement déjà chassé sur l'ancienne interface. Les chiffres
  détaillés restent disponibles via "🏛️ Gestion de la ville" (déjà branché, Phase 3).
  Si tu veux vraiment plus de pastilles en permanence, dis-le et on adapte le CSS
  du HUD en même temps (`flex-wrap: wrap` a déjà résolu ce problème une fois ailleurs).
- **Pas de sélecteur de langue FR/EN.** Toute la nouvelle interface est écrite en
  français en dur dans le HTML (pas de `data-i18n`) -- en ajouter un demanderait de
  traduire toute ton interface, pas juste brancher un bouton. À part si tu veux
  vraiment l'anglais un jour.

## Petits ajouts UX après la migration

- **Annuler la sélection / revenir en mode observation** : la pastille
  `#selectedBuildPill` (🔨 nom du bâtiment) est maintenant cliquable -- taper dessus
  annule le mode en cours (bâtiment/route/borne/démolir) via la nouvelle fonction
  `cancelSelection()` (`ui.js`), et la touche **Échap** fait la même chose. Sans
  mode actif, un clic sur la carte ouvre l'observateur au lieu de construire.

- **Catalogue (`#quickBuild`) qui ramait à l'ouverture** : la vraie cause n'était pas
  l'animation elle-même, mais l'accumulation -- `toggleCatalog()` permettait d'ouvrir
  plusieurs catégories à la fois, et cet état était sauvegardé entre les sessions. Plus
  le catalogue est exploré au fil du temps, plus de catégories restaient "ouvertes" en
  mémoire, donc plus de cartes à peindre à chaque ouverture du panneau. Passage en
  **accordéon** (une seule catégorie ouverte à la fois) + assainissement automatique
  d'un état déjà accumulé avant ce correctif (`restoreCatalogState()` ne garde
  désormais que la première catégorie ouverte trouvée). Le voile d'arrière-plan
  (`#backdrop`) a aussi été simplifié (plus de bascule `display:none/block` en même
  temps que le fondu, qui pouvait perturber l'animation) et le flou (`backdrop-filter`)
  retiré des panneaux et pastilles HUD (fonds déjà quasi opaques, flou invisible mais
  coûteux).
- **Plein écran** : nouveau bouton "⛶ Plein écran" dans le menu (☰), utilise l'API
  Fullscreen du navigateur. Le libellé change automatiquement ("Quitter le plein
  écran") une fois actif.

## Etat global après ces 4 phases

Le moteur de jeu réel (grille, bâtiments, walkers, créatures, mythologie, impôts,
diplomatie, commerce, calendrier...) tourne entièrement DANS ta nouvelle interface :
carte zoomable, catalogue de construction réel, observateur avec vraies données,
panneau debug. Ce qui reste hors-jeu pour l'instant : `openTradePanel`/`openArmyPanel`/
`launchAttack` (cartes prévues mais sans fonction dédiée -- l'armée n'existe pas
encore comme système, et la vue détaillée du commerce/diplomatie n'a pas encore son
propre écran dans l'observateur, seulement via "Gestion de la ville").

