const ensureUser = ({ redirect = '/pages/login/index' } = {}) => {
  const app = getApp();
  const storedUser = wx.getStorageSync('userInfo');
  const storedToken = wx.getStorageSync('token');
  const user = (app && app.globalData && app.globalData.userInfo) || storedUser;
  const token = (app && app.globalData && app.globalData.token) || storedToken;
  if (user && token) {
    if (app && app.cacheUser && (!app.globalData.userInfo || !app.globalData.token)) {
      app.cacheUser(user, token);
    }
    return { user, token };
  }
  if (redirect) {
    wx.reLaunch({ url: redirect });
  }
  return null;
};

const requireRole = (roles = [], options = {}) => {
  const auth = ensureUser(options);
  if (!auth) return null;
  if (roles.length && !roles.includes(auth.user.role)) {
    wx.showToast({ title: '无权限访问', icon: 'none' });
    if (options.redirectOnForbidden) {
      wx.reLaunch({ url: options.redirectOnForbidden });
    }
    return null;
  }
  return auth;
};

module.exports = {
  ensureUser,
  requireRole
};
