const { request } = require('../../utils/request');
const { requireRole } = require('../../utils/auth');
const app = getApp();

Page({
  data: {
    codeInput: ''
  },

  onShow() {
    requireRole(['staff', 'manager', 'super'], { redirect: '/pages/staff-login/index' });
  },

  onInput(e) {
    this.setData({ codeInput: (e.detail.value || '').trim() });
  },

  scanCode() {
    if (!requireRole(['staff', 'manager', 'super'], { redirect: '/pages/staff-login/index' })) return;
    wx.scanCode({
      success: (res) => {
        const code = res.result;
        this.verify(code);
      }
    });
  },

  submitManual() {
    if (!requireRole(['staff', 'manager', 'super'], { redirect: '/pages/staff-login/index' })) return;
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
