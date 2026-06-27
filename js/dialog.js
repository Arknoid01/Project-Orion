/* ===================== BOITE DE DIALOGUE A CHOIX ===================== */
// Modale réutilisable : titre + corps + N boutons, chacun avec son callback.
// Remplace le confirm() natif du navigateur et sert de primitive d'UI à tout
// système ayant besoin d'un choix joueur (diplomatie, plus tard commerce...).
// Une seule modale à la fois : un nouvel appel remplace la précédente.
//
// showChoice({
//   title, body,
//   dismissible: false,            // clic sur le fond = annule (défaut: true)
//   onDismiss: fn,                 // appelé si fermeture par le fond/Échap
//   choices: [
//     { label, type, disabled, hint, onPick }   // type: primary|good|danger|neutral
//   ]
// })

let dialogDismissHandler = null;

function showChoice(opts){
  opts = opts || {};
  const overlay = document.getElementById('dialogOverlay');
  const box = document.getElementById('dialogBox');
  if (!overlay || !box) return;

  const choices = opts.choices && opts.choices.length ? opts.choices : [{ label: 'OK', type: 'primary' }];
  const dismissible = opts.dismissible !== false;
  dialogDismissHandler = dismissible ? (opts.onDismiss || null) : null;

  box.innerHTML = '';

  if (opts.title){
    const h = document.createElement('h2');
    h.className = 'dialogTitle';
    h.textContent = opts.title;
    box.appendChild(h);
  }
  if (opts.body){
    const p = document.createElement('p');
    p.className = 'dialogBody';
    p.textContent = opts.body;
    box.appendChild(p);
  }

  const actions = document.createElement('div');
  actions.className = 'dialogActions';
  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'dialogBtn dialog-' + (choice.type || 'neutral');
    btn.textContent = choice.label;
    if (choice.disabled){
      btn.disabled = true;
      if (choice.hint) btn.title = choice.hint;
    } else {
      btn.onclick = () => {
        closeDialog();
        if (typeof choice.onPick === 'function') choice.onPick();
      };
    }
    if (choice.hint){
      const small = document.createElement('small');
      small.className = 'dialogBtnHint';
      small.textContent = choice.hint;
      btn.appendChild(small);
    }
    actions.appendChild(btn);
  });
  box.appendChild(actions);

  overlay.dataset.dismissible = dismissible ? '1' : '0';
  overlay.classList.add('open');
}

function closeDialog(){
  const overlay = document.getElementById('dialogOverlay');
  if (overlay) overlay.classList.remove('open');
  dialogDismissHandler = null;
}

function isDialogOpen(){
  const overlay = document.getElementById('dialogOverlay');
  return !!overlay && overlay.classList.contains('open');
}

// Clic sur le fond sombre : ferme si la modale est annulable, et déclenche le
// callback d'annulation éventuel.
function onDialogBackdrop(e){
  const overlay = document.getElementById('dialogOverlay');
  if (!overlay || e.target !== overlay) return;
  if (overlay.dataset.dismissible !== '1') return;
  const handler = dialogDismissHandler;
  closeDialog();
  if (typeof handler === 'function') handler();
}

// Raccourci type confirm() : deux boutons Oui/Non, callback sur "oui".
function showConfirm(title, body, onYes){
  showChoice({
    title,
    body,
    choices: [
      { label: t('dialog.no'), type: 'neutral' },
      { label: t('dialog.yes'), type: 'danger', onPick: onYes },
    ],
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isDialogOpen()){
    const overlay = document.getElementById('dialogOverlay');
    if (overlay && overlay.dataset.dismissible === '1'){
      const handler = dialogDismissHandler;
      closeDialog();
      if (typeof handler === 'function') handler();
    }
  }
});
