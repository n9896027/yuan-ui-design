const KEY = 'silent-programme:favorites:v1';

function read() {
  const value = wx.getStorageSync(KEY);
  if (value === '' || value === undefined) return [];
  if (!Array.isArray(value) || !value.every(id => typeof id === 'string')) {
    throw new Error('收藏数据无法读取');
  }
  return value;
}

function toggle(id) {
  const next = new Set(read());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  wx.setStorageSync(KEY, [...next]);
  return next.has(id);
}

module.exports = { read, toggle };
