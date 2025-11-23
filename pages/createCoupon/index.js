const { request } = require('../../utils/request');
const app = getApp();

Page({
  data: {
    templates: [],
    selectedId: null,
    targetPhone: '',
    submitting: false
  },

  onShow() {
    if (!this.ensureLogin()) return;
    this.loadTemplates();
  },

  ensureLogin() {
    if (app.globalData.userInfo && app.globalData.token) return true;
    const storedUser = wx.getStorageSync('userInfo');
    const storedToken = wx.getStorageSync('token');
    if (storedUser && storedToken) {
      app.cacheUser?.(storedUser, storedToken);
      return true;
    }
    wx.reLaunch({ url: '/pages/login/index' });
    return false;
  },

  loadTemplates() {
    request({ url: '/coupon/templates', method: 'GET' })
      .then((res) => {
        const templates = res.templates || [];
        this.setData({ templates, selectedId: templates[0]?.id || null });
      })
      .catch(() => {});
  },

  onSelectTemplate(e) {
    this.setData({ selectedId: Number(e.currentTarget.dataset.id) });
  },

  onPhoneInput(e) {
    this.setData({ targetPhone: (e.detail.value || '').trim() });
  },

  submit() {
    if (this.data.submitting) return;
    const { selectedId, targetPhone } = this.data;
    if (!selectedId) {
      wx.showToast({ title: '请选择优惠券模板', icon: 'none' });
      return;
    }
    if (targetPhone && !/^\d{11}$/.test(targetPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    request({
      url: '/coupon/create',
      method: 'POST',
      data: { templateId: selectedId, phone: targetPhone }
    })
      .then(() => {
        wx.showToast({ title: '发券成功', icon: 'success' });
        wx.navigateTo({ url: '/pages/couponList/index' });
      })
      .catch(() => {})
      .finally(() => this.setData({ submitting: false }));
  }
});
