/* ===================== TEXTES NARRATIFS (FR/EN) ===================== */
(function(){
  function scenarioStories(id, intro, outro){
    return {
      [`story.scenario.${id}.intro`]: intro,
      [`story.scenario.${id}.outro`]: outro,
    };
  }

  function campaignEpisodes(pathId, pairs){
    const out = {};
    pairs.forEach((pair, i) => {
      const n = i + 1;
      out[`story.campaign.${pathId}.${n}.intro`] = pair[0];
      out[`story.campaign.${pathId}.${n}.outro`] = pair[1];
    });
    return out;
  }

  const fr = Object.assign(
    {},
    scenarioStories('colonization',
      'Des messagers d\'Argos annoncent que la Méditerranée s\'ouvre à vos colons. Le conseil de la cité vous confie deux navires et une poignée de drachmes : fondez des comptoirs lointains, puis ramenez prospérité à la métropole.\n\nChaque colonie devra survivre seule avant de renforcer votre prestige.',
      'Les deux colonies portent désormais votre bannière. Leurs cargaisons affluent vers le port et votre cité mère compte parmi les puissances de la côte. Les oracles murmurent qu\'un plus grand destin vous attend…'),
    scenarioStories('defense',
      'Des pillards des collines rôdent aux abords de vos murs. Les anciens exigent casernes et hoplites avant que la population ne fuit. Élevez une cité forte assez grande pour tenir tête aux bandits.',
      'Vos hoplites patrouillent en ordre et les habitants dorment sans crainte. La cité a prouvé qu\'elle sait se défendre — les voisins hésitent désormais à la provoquer.'),
    scenarioStories('conquest',
      'L\'archonte vous charge d\'étendre votre influence par les armes. Les cités voisines faiblissent ; une armée disciplinée pourrait les soumettre. Levez des hoplites, forgez des armes et marchez sur vos rivaux.',
      'Deux cités inclinent le front devant vos étendards. Votre nom est prononcé avec crainte dans les agoras voisines. La conquête ouvre la voie à un empire — ou à la vengeance des vaincus.'),
    scenarioStories('prosperity',
      'Apollon a béni votre fondation : les habitants réclament culture, beauté et faveur divine. Une agora animée et un lieu de spectacle doivent élever leurs mœurs jusqu\'à la villa.',
      'Musiciens, athlètes et prêtres célèbrent votre cité. Les villas se multiplient et les dieux sourient. Olympos n\'est plus un simple campement — c\'est une cité civilisée.'),
    scenarioStories('culture',
      'Le poète local prêche que sans muses et gymnase, une cité reste barbare. Reliez une agora à un lieu culturel et élevez au moins une maison jusqu\'au rang de domaine.',
      'Les citoyens débattent de philosophie sous le portique du stoa. La culture circule dans vos rues comme l\'eau de la fontaine — votre cité entre dans l\'histoire.'),
    scenarioStories('trade',
      'Votre baie est profonde mais vos entrepôts vides. Les marchands n\'attendront pas : ouvrez des comptoirs, accueillez les caravanes et faites de votre cité un carrefour du commerce égéen.',
      'Les navires de Tyr, Milet et Rhodes accostent chaque semaine. Votre trésor gonfle et votre nom est connu des comptoirs lointains. Le commerce a forgé votre fortune.'),
    scenarioStories('monuments',
      'Zeus lui-même aurait posé les fondations de cette colline. Le clergé exige un grand temple digne de l\'Olympe et une cité assez peuplée pour l\'entourer de fidèles.',
      'Les pèlerins gravissent la colline vers votre temple monumental. Zeus accorde sa protection et les autres cités vous regardent avec respect — ou jalousie.'),
    scenarioStories('beauty',
      'Un mécène athénien offre des statues si vous transformez votre cité en jardin de l\'Attique. Ornez vos places, plantez des jardins et logez vos notables dans une résidence splendide.',
      'Les voyageurs s\'arrêtent pour admirer vos colonnades fleuries. La beauté attire de nouveaux citoyens et les dieux de l\'harmonie veillent sur vos rues.'),
    scenarioStories('industry',
      'Des carriers ont trouvé une veine de marbre, mais sans atelier vos blocs ne valent rien. Transformez la pierre en sculptures et nourrissez une population ouvrière.',
      'Vos sculpteurs exportent des œuvres jusqu\'aux sanctuaires voisins. L\'industrie du marbre fait vivre la cité — et remplit les coffres du trésor.'),
    scenarioStories('faith',
      'La Pythie a parlé : Apollon attend un temple et des rites réguliers. Sans piété, les récoltes flétrissent et les oracles se taisent. Restaurez la faveur du dieu.',
      'Les prêtres célèbrent des processions éclatantes et Apollon accorde des présages favorables. Votre cité brille comme un phare de la foi dans la région.'),
    scenarioStories('adventures',
      'Des héros errants cherchent un sanctuaire où deposer leurs trophées. Bâtissez un temple des héros et lancez des expéditions légendaires — le peuple a soif de récits.',
      'Le bardes chantent vos champions dans les tavernes. Deux quêtes accomplies, des artefacts au trésor : votre cité devient le refuge des héros de la mythologie.'),
    scenarioStories('harvest',
      'La Démeter a favorisé vos plaines dorées. Moissonnez, remplissez un grenier et nourrissez une population qui grandit avec les épis.',
      'Les gerbes s\'empilent dans votre grenier et nul ne craint la famine. Demeter sourit — votre cité peut affronter l\'hiver en paix.'),
    campaignEpisodes('attica', [
      ['Des colons venus de l\'Attique posent leurs outils sur cette terre fertile. Le premier défi : attirer assez d\'habitants pour qu\'une agora ait du sens.', 'La cité respire. Des familles s\'installent et les premiers marchands essaient vos routes. L\'Attique vous a donné naissance — honorez-la.'],
      ['Les champs demandent plus de mains et les ateliers de la pierre attendent le marbre. Produisez du blé et des sculptures pour asseoir votre réputation.', 'Les greniers débordent et les sculpteurs travaillent sans relâche. Votre nom circule dans les plaines voisines.'],
      ['Les notables exigent des demeures dignes de leur rang. Faites évoluer une maison jusqu\'à la villa et montrez que la prospérité n\'est pas un vain mot.', 'Une villa domine désormais le quartier des magistrats. La cité a l\'allure d\'une vraie polis.'],
      ['Demeter réclame un sanctuaire et les marchands un comptoir. Le commerce et la foi doivent marcher de pair.', 'Le temple de Demeter reçoit les offrandes et votre comptoir accueille les caravanes. L\'Attique prospère.'],
      ['Zeus observe depuis l\'Olympe. Satisfaites le roi des dieux et accueillez encore plus de citoyens.', 'Les prêtres annoncent la faveur de Zeus. Votre cité compte parmi les favorites du panthéon.'],
      ['L\'heure de l\'apothéose a sonné : domaine prestigieux et Demeter comble de grâce. Prouvez que cette cité mérite l\'histoire.', 'Les chroniqueurs graveront ce jour dans le marbre. L\'Attique est achevée — votre légende commence.'],
    ]),
    campaignEpisodes('archipelago', [
      ['Vos navigateurs ont trouvé une île sans carrière. Tout marbre devra venir de l\'étranger — le commerce n\'est pas un luxe, c\'est une question de survie.', 'Le premier comptoir accueille un navire chargé de pierre blanche. L\'archipel vous appartient, pour le meilleur et pour le pire.'],
      ['Les architectes attendent du marbre importé. Accumulez des stocks avant que les prix ne flambent.', 'Vos entrepôts regorgent de marbre. Les chantiers peuvent enfin reprendre.'],
      ['Les sculpteurs de l\'île rivalisent avec Athènes — s\'ils ont la matière. Peuplez l\'atelier et remplissez vos réserves d\'œuvres.', 'Des statues ornent le port. Les marchands paient cher vos sculptures.'],
      ['Un atelier permanent et davantage de marbre : l\'île doit devenir un centre d\'art, pas un simple entrepôt.', 'Le bruit des ciseaux résonne dans la baie. L\'archipel exporte de la beauté.'],
      ['Poséidon règne sur les mers qui vous entourent. Deux comptoirs et son temple assureront votre suprématie maritime.', 'Les marins saluent votre temple de Poséidon. Deux routes commerciales relient l\'île au monde.'],
      ['L\'apothéose de l\'archipel : ateliers florissants, stocks abondants et Poséidon comblé. L\'île ne dépendra plus de personne.', 'Les navires de toutes les mers accostent chez vous. L\'archipel est devenu une légende commerçante.'],
    ]),
    campaignEpisodes('pelion', [
      ['Les pentes boisées du Pélion accueillent vos bûcherons. Commencez modestement — la forêt est riche mais exigeante.', 'Les premières huttes se dressent entre les pins. La montagne vous teste déjà.'],
      ['Le charbon alimente les forges naissantes et le poisson les tables. La montagne et la mer doivent nourrir vos ouvriers.', 'Fumée des charbonnières et filets séchés au port : la cité montagnarde tient debout.'],
      ['Plus de blé ne pousse ici. Importez des céréales ou votre peuple affamera — le commerce devient vital.', 'Des convois de blé remontent la piste. Vous avez évité la famine — de justesse.'],
      ['Le bronze demande charbon, marbre importé et mains expertes. Les forges du Pélion doivent s\'éveiller.', 'Le métal coule dans vos moules. Votre cité forge l\'avenir — littéralement.'],
      ['Apollon veille sur les arts et la guérison. Une villa et sa faveur marqueront l\'apogée de votre ascension.', 'Une villa domine la vallée et Apollon accorde ses bienfaits. Le Pélion rayonne.'],
      ['Armes, bronze et Apollon satisfait : la montagne ne sera plus jamais une proie facile.', 'Vos armées sont équipées et les dieux contents. Le Pélion est achevé — personne n\'osera vous défier ici.'],
    ]),
    campaignEpisodes('thrace', [
      ['Les plaines thraces sont disputées. Levez une caserne et recrutez des hoplites avant que les voisins ne le fassent.', 'Vos soldats s\'entraînent au crépuscule. La guerre est une question de temps.'],
      ['L\'armée grandit et les armureries s\'activent. Préparez-vous à frapper.', 'Les hoplites sont prêts et les armes empilées. Votre ombre s\'allonge sur la région.'],
      ['Athéna patronne les guerriers justes. Érigez son temple et concentrez votre puissance militaire.', 'Le temple d\'Athéna domine l\'acropole. Les stratèges planifient déjà la campagne.'],
      ['Une cité voisine faiblit. Frappez maintenant — la conquête apprend le respect.', 'Votre première victoire est célébrée dans les rues. D\'autres cités tremblent.'],
      ['Deux cités inclinent le front et Athéna sourit. L\'hégémonie thrace est à portée de lance.', 'Votre bannière flotte sur deux cités conquises. Athéna vous favorise.'],
      ['Trois cités soumises et une armée invincible : achevez la domination de la Thrace.', 'La Thrace entière connaît votre nom. Les bardes chantent vos victoires — la campagne est terminée.'],
    ]),
    campaignEpisodes('wineRoute', [
      ['Les coteaux sont propices à la vigne. Plantez, vendangez et faites naître une tradition viticole.', 'Les premières grappes fermentent dans vos cuves. Dionysos hulule déjà de plaisir.'],
      ['Transformez le raisin en vin — les symposia attendent leurs amphores.', 'Le vin coule et les marchands reniflent déjà les fûts. La route du vin s\'ouvre.'],
      ['Huile, vin et population : la cité doit grandir autour de ses vignobles.', 'Oliviers et vignes entourent des quartiers animés. La prospérité est au rendez-vous.'],
      ['Dionysos exige un temple et vos amphores doivent partir vers l\'étranger. Exportez la gloire de votre millésime.', 'Le temple de Dionysos reçoit les libations et votre comptoir expédie le vin.'],
      ['Une résidence pour les notables et des reserves pleines : le vin a bâti une aristocratie.', 'Les magistrats trinquent dans leurs résidences. Votre vin est célèbre dans toute la mer Égée.'],
      ['Population florissante, Dionysos comblé et deux comptoirs actifs : la route du vin est achevée.', 'Les navires chargés de vin quittent votre port chaque lune. Dionysos lui-même bénit cette cité — la route est complète.'],
    ])
  );

  const en = Object.assign(
    {},
    scenarioStories('colonization',
      'Messengers from Argos say the Mediterranean is open to your colonists. The city council gives you two ships and a purse of drachmas: found distant outposts, then bring prosperity back to the mother city.\n\nEach colony must survive on its own before it strengthens your prestige.',
      'Two colonies now fly your banner. Their cargoes flood the harbor and your capital ranks among the coastal powers. Oracles whisper that a greater destiny awaits…'),
    scenarioStories('defense',
      'Hill raiders prowl beyond your walls. Elders demand barracks and hoplites before the people flee. Raise a strong city large enough to stand against the bandits.',
      'Your hoplites patrol in order and citizens sleep without fear. The city has proven it can defend itself — neighbors now hesitate to provoke it.'),
    scenarioStories('conquest',
      'The archon orders you to expand by force. Weaker neighbor cities can be subdued — if you field a disciplined army. Raise hoplites, forge arms, and march on your rivals.',
      'Two cities bow before your standards. Your name is spoken with fear in nearby agoras. Conquest opens the path to empire — or to the revenge of the defeated.'),
    scenarioStories('prosperity',
      'Apollo has blessed your founding: citizens demand culture, beauty, and divine favor. A lively agora and a cultural venue must lift their manners to the villa.',
      'Musicians, athletes, and priests celebrate your city. Villas multiply and the gods smile. Olympos is no longer a camp — it is a civilized polis.'),
    scenarioStories('culture',
      'The local poet says that without muses and a gymnasium, a city stays barbarian. Link an agora to a cultural venue and raise at least one house to estate rank.',
      'Citizens debate philosophy under the stoa portico. Culture flows through your streets like fountain water — your city enters history.'),
    scenarioStories('trade',
      'Your bay is deep but your warehouses empty. Merchants will not wait: open trading posts, welcome caravans, and make your city an Aegean crossroads.',
      'Ships from Tyre, Miletus, and Rhodes dock every week. Your treasury swells and your name is known at distant counters. Trade has forged your fortune.'),
    scenarioStories('monuments',
      'Zeus himself might have laid these hill foundations. The clergy demand a grand temple worthy of Olympus and a population large enough to surround it with faithful.',
      'Pilgrims climb the hill to your grand temple. Zeus grants protection and other cities look on with respect — or envy.'),
    scenarioStories('beauty',
      'An Athenian patron offers statues if you turn your city into an Attic garden. Adorn your squares, plant gardens, and house your notables in a splendid residence.',
      'Travelers stop to admire your flowered colonnades. Beauty draws new citizens and the gods of harmony watch over your streets.'),
    scenarioStories('industry',
      'Quarrymen found a vein of marble, but without workshops the blocks are worthless. Turn stone into sculpture and feed a working population.',
      'Your sculptors export works to neighboring sanctuaries. The marble trade feeds the city — and fills the treasury.'),
    scenarioStories('faith',
      'The Pythia has spoken: Apollo awaits a temple and regular rites. Without piety, harvests wither and oracles fall silent. Restore the god\'s favor.',
      'Priests hold bright processions and Apollo grants favorable omens. Your city shines as a beacon of faith in the region.'),
    scenarioStories('adventures',
      'Wandering heroes seek a shrine for their trophies. Build a hero temple and launch legendary expeditions — the people thirst for tales.',
      'Bards sing your champions in the taverns. Two quests completed, artifacts in the treasury: your city becomes a refuge for mythic heroes.'),
    scenarioStories('harvest',
      'Demeter has favored your golden plains. Harvest, fill a granary, and feed a population that grows with the sheaves.',
      'Sheaves pile in your granary and none fear famine. Demeter smiles — your city can face winter in peace.'),
    campaignEpisodes('attica', [
      ['Colonists from Attica set tools on fertile soil. First challenge: draw enough inhabitants for an agora to matter.', 'The city breathes. Families settle and first merchants try your roads. Attica gave you birth — honor it.'],
      ['Fields need more hands and stone workshops await marble. Produce wheat and sculpture to build your reputation.', 'Granaries overflow and sculptors work tirelessly. Your name travels the neighboring plains.'],
      ['Notables demand homes worthy of their rank. Grow a house to villa and prove prosperity is real.', 'A villa now dominates the magistrates\' quarter. The city looks like a true polis.'],
      ['Demeter wants a shrine and merchants a trading post. Trade and faith must walk together.', 'Demeter\'s temple receives offerings and your counter welcomes caravans. Attica prospers.'],
      ['Zeus watches from Olympus. Please the king of gods and welcome more citizens.', 'Priests announce Zeus\'s favor. Your city ranks among the pantheon\'s favorites.'],
      ['Apotheosis time: a prestigious estate and Demeter\'s grace. Prove this city deserves history.', 'Chroniclers will carve this day in marble. Attica is complete — your legend begins.'],
    ]),
    campaignEpisodes('archipelago', [
      ['Your sailors found an island without quarries. All marble must come from abroad — trade is survival, not luxury.', 'The first counter welcomes a ship laden with white stone. The archipelago is yours, for better or worse.'],
      ['Architects wait for imported marble. Stock up before prices soar.', 'Warehouses brim with marble. Construction can finally resume.'],
      ['Island sculptors rival Athens — if they have material. Fill workshops and sculpture reserves.', 'Statues adorn the harbor. Merchants pay dearly for your art.'],
      ['A permanent workshop and more marble: the island must be an art hub, not a warehouse.', 'Chisel sounds echo in the bay. The archipelago exports beauty.'],
      ['Poseidon rules the seas around you. Two counters and his temple will secure maritime supremacy.', 'Sailors salute your Poseidon temple. Two trade routes link the island to the world.'],
      ['Archipelago apotheosis: thriving workshops, rich stocks, and pleased Poseidon. The island depends on no one.', 'Ships from every sea dock here. The archipelago became a trading legend.'],
    ]),
    campaignEpisodes('pelion', [
      ['Wooded Pelion slopes welcome your loggers. Start modestly — the forest is rich but demanding.', 'First huts rise among the pines. The mountain already tests you.'],
      ['Coal feeds newborn forges and fish fills tables. Mountain and sea must feed your workers.', 'Smoke from charcoal pits and nets drying at port: the mountain city holds.'],
      ['No wheat grows here. Import grain or your people starve — trade becomes vital.', 'Wheat convoys climb the trail. You avoided famine — barely.'],
      ['Bronze needs coal, imported marble, and skilled hands. Pelion forges must awaken.', 'Metal flows in your molds. Your city literally forges the future.'],
      ['Apollo watches arts and healing. A villa and his favor mark the peak of your rise.', 'A villa overlooks the valley and Apollo grants blessings. Pelion shines.'],
      ['Arms, bronze, and satisfied Apollo: the mountain will never be easy prey again.', 'Your armies are equipped and gods content. Pelion is complete — none dare challenge you here.'],
    ]),
    campaignEpisodes('thrace', [
      ['Thracian plains are contested. Raise a barracks and recruit hoplites before neighbors do.', 'Soldiers drill at dusk. War is a matter of time.'],
      ['The army grows and armories hum. Prepare to strike.', 'Hoplites are ready and arms stacked. Your shadow lengthens over the region.'],
      ['Athena patronizes just warriors. Build her temple and concentrate military power.', 'Athena\'s temple dominates the acropolis. Strategists already plan the campaign.'],
      ['A neighbor city weakens. Strike now — conquest teaches respect.', 'Your first victory is celebrated in the streets. Other cities tremble.'],
      ['Two cities bow and Athena smiles. Thracian hegemony is within spear reach.', 'Your banner flies over two conquered cities. Athena favors you.'],
      ['Three cities subdued and an invincible army: finish Thracian domination.', 'All Thrace knows your name. Bards sing your victories — the campaign is done.'],
    ]),
    campaignEpisodes('wineRoute', [
      ['Slopes suit the vine. Plant, harvest, and birth a wine tradition.', 'First grapes ferment in your vats. Dionysos already howls with pleasure.'],
      ['Turn grapes into wine — symposia await their amphorae.', 'Wine flows and merchants sniff the casks. The wine route opens.'],
      ['Oil, wine, and population: the city must grow around its vineyards.', 'Olives and vines surround lively quarters. Prosperity has arrived.'],
      ['Dionysos wants a temple and your amphorae must go abroad. Export your vintage\'s glory.', 'Dionysos\'s temple receives libations and your counter ships the wine.'],
      ['A residence for notables and full reserves: wine built an aristocracy.', 'Magistrates toast in their residences. Your wine is famous across the Aegean.'],
      ['Flourishing population, pleased Dionysos, two active counters: the wine route is complete.', 'Wine-laden ships leave your port each moon. Dionysos himself blesses this city.'],
    ])
  );

  if (typeof mergeI18nStrings === 'function'){
    mergeI18nStrings('fr', fr);
    mergeI18nStrings('en', en);
  }
})();
