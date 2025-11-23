const { request } = require('./utils/request');

const defaultApiBase = 'http://localhost:3000';

App({
  globalData: {
    apiBaseUrl: defaultApiBase,
    token: '',
    userInfo: null,
    lastWxCode: ''
  },

  onLaunch() {
    const storedToken = wx.getStorageSync('token');
    const storedUser = wx.getStorageSync('userInfo');
    if (storedToken && storedUser) {
      this.globalData.token = storedToken;
      this.globalData.userInfo = storedUser;
      return;
    }

    wx.login({
      success: (res) => {
        if (!res.code) return;
        this.globalData.lastWxCode = res.code;
        request({
          url: '/auth/loginByCode',
          method: 'POST',
          data: { code: res.code },
          loading: false
        })
          .then((data) => {
            if (data && data.token && data.user) {
              this.cacheUser(data.user, data.token);
            }
          })
          .catch(() => {});
      }
    });
  },

  cacheUser(user, token) {
    this.globalData.userInfo = user;
    this.globalData.token = token;
    wx.setStorageSync('userInfo', user);
    wx.setStorageSync('token', token);
  }
});
