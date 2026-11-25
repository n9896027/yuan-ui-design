const programme = require('../../data/programme');
const favorites = require('../../utils/favorites');

Page({
  data: { programme, films: [], status: '' },
  onShow() {
    let saved = [];
    let status = '';
    try { saved = favorites.read(); }
    catch { status = '收藏记录暂时无法读取'; }
    this.setData({ films: programme.films.map(film => ({ ...film, favorite: saved.includes(film.id) })), status });
  },
  openFilm(event) {
    wx.navigateTo({ url: '/pages/film/film?id=' + encodeURIComponent(event.currentTarget.dataset.id) });
  }
});
