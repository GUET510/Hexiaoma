const defaultApiBase = 'http://localhost:3000';

const getApiBaseUrl = () => {
  try {
    const ext = (wx.getExtConfigSync && wx.getExtConfigSync()) || {};
    if (ext.apiBaseUrl) return ext.apiBaseUrl;
  } catch (e) {}

  try {
    const injected = wx.getStorageSync('apiBaseUrl');
    if (injected) return injected;
  } catch (e) {}

  return defaultApiBase;
};

module.exports = { getApiBaseUrl, defaultApiBase };
