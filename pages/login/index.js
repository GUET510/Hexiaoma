const { request } = require('../../utils/request');
const app = getApp();

Page({
  data: {
    loading: false
  },

  onLoad() {
    if (app.globalData.userInfo && app.globalData.token) {
      wx.reLaunch({ url: '/pages/couponList/index' });
      return;
    }
    const storedUser = wx.getStorageSync('userInfo');
    const storedToken = wx.getStorageSync('token');
    if (storedUser && storedToken) {
      app.cacheUser?.(storedUser, storedToken);
      wx.reLaunch({ url: '/pages/couponList/index' });
    }
  },

  loginWithCode() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.login({
      success: (resp) => {
        if (!resp.code) {
          wx.showToast({ title: '获取登录凭证失败', icon: 'none' });
          this.setData({ loading: false });
          return;
        }
        app.globalData.lastWxCode = resp.code;
        request({ url: '/auth/loginByCode', method: 'POST', data: { code: resp.code }, loading: true })
          .then((res) => {
            if (res && res.token && res.user) {
              app.cacheUser(res.user, res.token);
              wx.showToast({ title: '登录成功', icon: 'success' });
              wx.reLaunch({ url: '/pages/couponList/index' });
            }
          })
          .catch(() => {})
          .finally(() => this.setData({ loading: false }));
      },
      fail: () => {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        this.setData({ loading: false });
      }
    });
  },

  goStaffLogin() {
    wx.navigateTo({ url: '/pages/staff-login/index' });
  }
});
