const app = getApp();
const { makeQrToCanvas } = require('../../utils/qrcode');

Page({
  data: {
    phoneDisplay: '',
    coupons: [],
    currentCoupon: null,
    qrReady: false
  },

  onLoad() {
    this.ensureLogin();
    this.syncCoupons();
  },

  onShow() {
    this.ensureLogin();
    this.syncCoupons();
  },

  ensureLogin() {
    const storedPhone = wx.getStorageSync('userPhone');
    if (!storedPhone) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    this.setData({ phoneDisplay: storedPhone });
    app.globalData.userPhone = storedPhone;
  },

  syncCoupons() {
    const storedCoupons = wx.getStorageSync('coupons') || [];
    this.setData({ coupons: storedCoupons });
    app.globalData.coupons = storedCoupons;
    const active = storedCoupons.find(item => item.status === 'active');
    if (active) {
      this.setData({ currentCoupon: this.decorateCoupon(active), qrReady: true });
      this.drawQr(active.code);
    } else {
      this.setData({ currentCoupon: null, qrReady: false });
    }
  },

  generateCoupon() {
    if (!app.globalData.userPhone) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    const timestamp = Date.now();
    const code = `HX-${timestamp}`;
    const coupon = {
      id: timestamp,
      code,
      status: 'active',
      createdAt: this.formatTime(new Date())
    };
    const coupons = [coupon, ...this.data.coupons];
    app.globalData.coupons = coupons;
    wx.setStorageSync('coupons', coupons);
    this.setData({ coupons, currentCoupon: this.decorateCoupon(coupon), qrReady: true });
    this.drawQr(code);
  },

  goVerify() {
    wx.navigateTo({ url: '/pages/verify/index' });
  },

  drawQr(text) {
    const query = wx.createSelectorQuery();
    query.select('#couponQr').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const size = 300;
      canvas.width = size;
      canvas.height = size;
      makeQrToCanvas(text, { canvasId: 'couponQr', size, ctx: canvas.getContext('2d') });
    });
  },

  decorateCoupon(coupon) {
    return {
      ...coupon,
      statusLabel: coupon.status === 'used' ? '已核销' : '未核销'
    };
  },

  formatTime(date) {
    const pad = (n) => (n < 10 ? `0${n}` : n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
});
