const app = getApp();
const { makeQrToCanvas } = require('../../utils/qrcode');

Page({
  data: {
    loggedIn: false,
    phoneDisplay: '未授权',
    coupons: [],
    currentCoupon: null,
    qrReady: false,
    scanInput: '',
    verifyMessage: ''
  },

  onLoad() {
    const storedPhone = wx.getStorageSync('userPhone');
    const storedCoupons = wx.getStorageSync('coupons') || [];
    if (storedPhone) {
      this.setData({ loggedIn: true, phoneDisplay: storedPhone });
      app.globalData.userPhone = storedPhone;
    }
    if (storedCoupons.length) {
      this.setData({ coupons: storedCoupons });
      app.globalData.coupons = storedCoupons;
      const active = storedCoupons.find(item => item.status === 'active');
      if (active) {
        this.setData({ currentCoupon: this.decorateCoupon(active), qrReady: true });
        this.drawQr(active.code);
      }
    }
  },

  onGetPhoneNumber(e) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      const masked = '用户手机号已授权';
      this.setData({ loggedIn: true, phoneDisplay: masked });
      app.globalData.userPhone = masked;
      wx.setStorageSync('userPhone', masked);
    } else {
      wx.showToast({ title: '需要手机号授权', icon: 'none' });
    }
  },

  generateCoupon() {
    if (!this.data.loggedIn) {
      wx.showToast({ title: '请先完成手机号授权', icon: 'none' });
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
    this.setData({ coupons, currentCoupon: this.decorateCoupon(coupon), qrReady: true, verifyMessage: '' });
    this.drawQr(code);
  },

  drawQr(text) {
    const query = wx.createSelectorQuery();
    query.select('#couponQr').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const size = 300;
      canvas.width = size;
      canvas.height = size;
      makeQrToCanvas(text, { canvasId: 'couponQr', size, ctx });
    });
  },

  scanCoupon() {
    if (!this.data.loggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        this.verifyCoupon(res.result);
      },
      fail: () => {
        wx.showToast({ title: '扫码失败', icon: 'none' });
      }
    });
  },

  onScanInput(e) {
    this.setData({ scanInput: e.detail.value });
  },

  verifyManual() {
    this.verifyCoupon(this.data.scanInput.trim());
  },

  verifyCoupon(code) {
    if (!code) {
      wx.showToast({ title: '请输入核销码', icon: 'none' });
      return;
    }
    const coupons = [...this.data.coupons];
    const target = coupons.find(item => item.code === code);
    if (!target) {
      this.setData({ verifyMessage: '未找到该核销码，请确认后再试' });
      return;
    }
    if (target.status === 'used') {
      this.setData({ verifyMessage: '该优惠券已核销' });
      return;
    }
    target.status = 'used';
    this.setData({
      coupons,
      verifyMessage: '核销成功',
      currentCoupon: this.decorateCoupon(target)
    });
    app.globalData.coupons = coupons;
    wx.setStorageSync('coupons', coupons);
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
