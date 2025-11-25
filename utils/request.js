const normalizeUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  const app = getApp();
  const base = (app && app.globalData && app.globalData.apiBaseUrl) || '';
  return `${base}${url}`;
};

const resetAuth = () => {
  try {
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
  } catch (e) {}
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.token = '';
    app.globalData.userInfo = null;
  }
  wx.reLaunch({ url: '/pages/login/index' });
};

const request = ({ url, method = 'GET', data = {}, header = {}, loading = true, loadingText = '加载中' }) => {
  const app = getApp();
  const token = wx.getStorageSync('token') || (app && app.globalData && app.globalData.token);
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...header
  };
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    if (loading) {
      wx.showLoading({ title: loadingText, mask: true });
    }
    wx.request({
      url: normalizeUrl(url),
      method,
      data,
      header: finalHeaders,
      success: (res) => {
        if (res.statusCode === 401) {
          wx.showToast({ title: res.data?.message || '登录已过期，请重新登录', icon: 'none' });
          resetAuth();
          reject(res.data || res);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const message = res.data?.message;
          if (res.statusCode >= 500) {
            wx.showToast({ title: '系统繁忙，请稍后再试', icon: 'none' });
          } else {
            wx.showToast({ title: message || '请求失败', icon: 'none' });
          }
          reject(res.data || res);
        }
      },
      fail: (err) => {
        wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
        reject(err);
      },
      complete: () => {
        if (loading) {
          wx.hideLoading();
        }
      }
    });
  });
};

module.exports = { request };
