const { request } = require('../../utils/request');
const app = getApp();

Page({
  data: {
    manualPhone: '',
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

  onGetPhoneNumber(e) {
    const phone = e.detail?.phoneNumber;
    if (!phone) {
      wx.showToast({ title: '未获取到授权手机号', icon: 'none' });
      return;
    }
    this.loginWithPhone(phone);
  },

  onManualPhoneInput(e) {
    this.setData({ manualPhone: (e.detail.value || '').trim() });
  },

  onManualSubmit() {
    const phone = (this.data.manualPhone || '').trim();
    if (!/^\d{11}$/.test(phone)) {
      wx.showToast({ title: '请输入11位手机号', icon: 'none' });
      return;
    }
    this.loginWithPhone(phone);
  },

  loginWithPhone(phone) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    request({
      url: '/auth/loginByPhone',
      method: 'POST',
      data: { phone, openid: app.globalData?.userInfo?.openid, unionid: app.globalData?.userInfo?.unionid, code: app.globalData?.lastWxCode }
    })
      .then((res) => {
        if (res && res.token && res.user) {
          app.cacheUser(res.user, res.token);
          wx.showToast({ title: '登录成功', icon: 'success' });
          wx.reLaunch({ url: '/pages/couponList/index' });
        }
      })
      .catch(() => {})
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  goStaffLogin() {
    wx.navigateTo({ url: '/pages/staff-login/index' });
  }
});
