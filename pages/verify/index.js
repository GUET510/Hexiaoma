const { request } = require('../../utils/request');
const app = getApp();

Page({
  data: {
    codeInput: ''
  },

  onShow() {
    this.guardStaff();
  },

  guardStaff() {
    const user = app.globalData.userInfo || wx.getStorageSync('userInfo');
    const token = app.globalData.token || wx.getStorageSync('token');
    if (!user || !token) {
      wx.reLaunch({ url: '/pages/staff-login/index' });
      return false;
    }
    if (user.role !== 'staff' && user.role !== 'manager') {
      wx.showToast({ title: '请使用员工账号登录', icon: 'none' });
      wx.reLaunch({ url: '/pages/staff-login/index' });
      return false;
    }
    app.cacheUser?.(user, token);
    return true;
  },

  onInput(e) {
    this.setData({ codeInput: (e.detail.value || '').trim() });
  },

  scanCode() {
    if (!this.guardStaff()) return;
    wx.scanCode({
      success: (res) => {
        const code = res.result;
        this.verify(code);
      }
    });
  },

  submitManual() {
    if (!this.guardStaff()) return;
    const code = this.data.codeInput;
    if (!code) {
      wx.showToast({ title: '请输入核销码', icon: 'none' });
      return;
    }
    this.verify(code);
  },

  verify(code) {
    request({ url: '/coupon/verify', method: 'POST', data: { code } })
      .then(() => {
        wx.showToast({ title: '核销成功', icon: 'success' });
      })
      .catch((err) => {
        if (!err?.message) return;
        wx.showToast({ title: err.message, icon: 'none' });
      });
  }
});
