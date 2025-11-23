const normalizeUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  const app = getApp();
  const base = (app && app.globalData && app.globalData.apiBaseUrl) || '';
  return `${base}${url}`;
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          wx.showToast({ title: res.data?.message || '请求失败', icon: 'none' });
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
