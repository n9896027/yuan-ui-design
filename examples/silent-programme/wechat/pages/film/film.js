const programme = require('../../data/programme');
const favorites = require('../../utils/favorites');

Page({
  data: { film: null, favorite: false, status: '' },
  onLoad(query) {
    const film = programme.films.find(item => item.id === query.id);
    if (!film) { this.setData({ status: '未找到该影片' }); return; }
    this.setData({ film });
    wx.setNavigationBarTitle({ title: film.title });
    try {
      this.setData({ favorite: favorites.read().includes(film.id) });
    } catch {
      this.setData({ status: '收藏记录暂时无法读取' });
    }
  },
  toggleFavorite() {
    try {
      this.setData({ favorite: favorites.toggle(this.data.film.id), status: '' });
    } catch {
      this.setData({ status: '收藏未更新，请稍后重试' });
    }
  },
  openProgramme() { wx.reLaunch({ url: '/pages/home/home' }); },
  onShareAppMessage() {
    const film = this.data.film;
    if (!film) return { title: programme.title, path: '/pages/home/home' };
    return { title: film.title + '｜' + programme.title, path: '/pages/film/film?id=' + encodeURIComponent(film.id), imageUrl: '/' + film.image };
  }
});
