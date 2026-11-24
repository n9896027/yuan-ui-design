const assert = require('node:assert/strict');
const store = new Map();
let navigation;
let blocked = false;
global.wx = {
  getStorageSync: key => store.get(key),
  setStorageSync(key, value) {
    if (blocked) throw new Error('full');
    store.set(key, value);
  },
  navigateTo({ url }) { navigation = url; },
  reLaunch({ url }) { navigation = url; },
  setNavigationBarTitle() {}
};

function openPage(modulePath) {
  let page;
  global.Page = spec => { page = { ...spec, data: { ...spec.data }, setData(changes) { Object.assign(this.data, changes); } }; };
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
  return page;
}

const home = openPage('../pages/home/home');
home.onShow();
const id = home.data.films[1].id;
home.openFilm({ currentTarget: { dataset: { id } } });
assert.equal(navigation, '/pages/film/film?id=' + id);
const details = openPage('../pages/film/film');
details.onLoad({ id });
details.toggleFavorite();
assert.equal(details.data.favorite, true);
home.onShow();
assert.ok(home.data.films.find(film => film.id === id).favorite);
const restored = openPage('../pages/film/film');
restored.onLoad({ id });
assert.ok(restored.data.favorite);
assert.equal(restored.onShareAppMessage().path, navigation);
assert.equal(restored.onShareAppMessage().imageUrl, '/' + restored.data.film.image);
blocked = true;
restored.toggleFavorite();
assert.ok(restored.data.favorite && restored.data.status);
blocked = false;
restored.toggleFavorite();
home.onShow();
assert.equal(home.data.films.find(film => film.id === id).favorite, false);
const key = 'silent-programme:favorites:v1';
store.set(key, 'damaged');
restored.toggleFavorite();
assert.equal(store.get(key), 'damaged');
assert.ok(restored.data.status);
const missing = openPage('../pages/film/film');
missing.onLoad({ id: 'missing' });
missing.openProgramme();
assert.equal(navigation, '/pages/home/home');
console.log('PASS mocked WeChat navigation, resume, local storage, failures and share data');
