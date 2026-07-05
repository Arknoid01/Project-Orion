/* ===================== DEFAITE ===================== */
// Symétrique des objectifs (victoire), mais pour l'échec. Deux conditions
// indépendantes, chacune avec un compteur "depuis combien de ticks d'affilée" pour
// éviter qu'un incident passager (incendie, trésor brièvement à sec) ne déclenche
// une défaite injuste -- il faut que la situation dure.
let everHadPopulation = false;
let zeroPopulationStreak = 0;
let bankruptStreak = 0;
let defeatAnnounced = false;
let defeatReason = null; // 'population' | 'bankruptcy'

function checkDefeat(){
  if (defeatAnnounced) return; // une fois annoncée, on ne la redéclenche pas

  const pop = computeTotalPopulation();
  if (pop > 0) everHadPopulation = true;

  zeroPopulationStreak = (everHadPopulation && pop === 0) ? zeroPopulationStreak + 1 : 0;
  bankruptStreak = (treasury < 0) ? bankruptStreak + 1 : 0;

  if (zeroPopulationStreak >= DEFEAT_POPULATION_TICKS){
    triggerDefeat('population');
  } else if (bankruptStreak >= DEFEAT_BANKRUPTCY_TICKS){
    triggerDefeat('bankruptcy');
  }

  renderObjectivesPanel(); // affiche/masque la bannière de défaite
}

function showDefeatModal(){
  if (typeof showChoice !== 'function') return;
  showChoice({
    title: t('defeat.title'),
    body: t('defeat.' + defeatReason),
    dismissible: false,
    choices: [
      {
        label: t('defeat.retry'),
        type: 'primary',
        onPick: () => {
          if (typeof hideMainMenu === 'function') hideMainMenu();
          if (typeof startScenario === 'function') startScenario(currentScenarioId);
        },
      },
      {
        label: t('menu.returnMain'),
        type: 'neutral',
        onPick: () => { if (typeof returnToMainMenu === 'function') returnToMainMenu(); },
      },
    ],
  });
}

function triggerDefeat(reason){
  if (typeof isColonyPhase === 'function' && isColonyPhase() && typeof abandonColony === 'function'){
    abandonColony(false);
    showNotification(t('colony.defeat'), 'bad');
    debugWarn('Colonie échouée : ' + reason);
    return;
  }
  defeatAnnounced = true;
  defeatReason = reason;
  if (typeof setGamePaused === 'function') setGamePaused(true);
  showNotification(t('defeat.' + reason), 'bad');
  showDefeatModal();
  debugWarn('Défaite : ' + reason);
}

function resumeDefeatStateAfterLoad(){
  if (!defeatAnnounced) return;
  if (typeof setGamePaused === 'function') setGamePaused(true);
  showDefeatModal();
}
