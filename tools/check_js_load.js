const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const order = [...html.matchAll(/script src="js\/([^"]+)"/g)].map((m) => m[1]);

const el = () => ({
  classList: { add() {}, remove() {}, toggle() {} },
  style: {},
  textContent: '',
  innerHTML: '',
  addEventListener() {},
  removeEventListener() {},
  appendChild() {},
  setAttribute() {},
  querySelector() { return null; },
});

global.document = {
  getElementById: () => el(),
  querySelectorAll: () => [],
  querySelector: () => null,
  documentElement: { lang: 'fr' },
  createElement: () => el(),
  body: el(),
};
global.window = global;
global.canvas = {
  width: 100,
  height: 100,
  style: {},
  getContext: () => new Proxy({}, { get: () => () => {} }),
  addEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
};
global.performance = { now: () => 0 };
global.localStorage = { getItem: () => null, setItem() {} };
global.setInterval = () => {};
global.Image = function Image() {
  this.onload = null;
  this.onerror = null;
  this.src = '';
  this.complete = false;
  this.naturalWidth = 0;
};
global.requestAnimationFrame = () => {};
global.devicePixelRatio = 1;
global.innerWidth = 1200;
global.innerHeight = 800;

for (const f of order) {
  const file = path.join(root, 'js', f.replace(/\//g, path.sep));
  try {
    eval(fs.readFileSync(file, 'utf8'));
    console.log('OK', f);
  } catch (e) {
    console.error('FAIL', f, e.message);
    console.error(e.stack);
    process.exit(1);
  }
}
console.log('All scripts loaded');
