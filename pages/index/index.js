const app = getApp();
const { makeQrToCanvas } = require('../../utils/qrcode');

Page({
  data: {
    phoneDisplay: '',
    coupons: [],
    activeCoupons: [],
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
    const active = storedCoupons.filter(item => item.status === 'active');
    this.setData({
      coupons: storedCoupons.map(coupon => this.decorateCoupon(coupon)),
      activeCoupons: active.map(coupon => this.decorateCoupon(coupon)),
      qrReady: active.length > 0
    }, () => {
      if (active.length > 0) {
        this.drawQrBatch(active);
      }
    });
    app.globalData.coupons = storedCoupons;
  },

  generateCoupon() {
    if (!app.globalData.userPhone) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    const timestamp = Date.now();
    const createdAt = this.formatTime(new Date());
    const presets = [
      { title: '200元优惠券', faceValue: 200, category: '通用' },
      { title: '500元油卡券', faceValue: 500, category: '油卡' },
      { title: '300元保养券', faceValue: 300, category: '保养' }
    ];

    const newCoupons = presets.map((preset, index) => ({
      id: `${timestamp}-${index}`,
      code: `HX-${preset.faceValue}-${timestamp + index}`,
      title: preset.title,
      faceValue: preset.faceValue,
      category: preset.category,
      status: 'active',
      createdAt
    }));

    const existingCoupons = wx.getStorageSync('coupons') || [];
    const coupons = [...newCoupons, ...existingCoupons];
    app.globalData.coupons = coupons;
    wx.setStorageSync('coupons', coupons);

    this.setData({
      coupons: coupons.map(coupon => this.decorateCoupon(coupon)),
      activeCoupons: newCoupons.map(coupon => this.decorateCoupon(coupon)),
      qrReady: true
    }, () => {
      this.drawQrBatch(newCoupons);
    });
  },

  goVerify() {
    wx.navigateTo({ url: '/pages/verify/index' });
  },

  drawQrBatch(coupons) {
    const query = wx.createSelectorQuery();
    const size = 260;
    coupons.forEach((coupon) => {
      query.select(`#qr-${coupon.id}`).fields({ node: true, size: true });
    });

    query.exec((res) => {
      if (!res) return;
      res.forEach((item, index) => {
        if (!item || !item.node) return;
        const canvas = item.node;
        canvas.width = size;
        canvas.height = size;
        const coupon = coupons[index];
        makeQrToCanvas(coupon.code, { canvasId: `qr-${coupon.id}`, size, ctx: canvas.getContext('2d') });
      });
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
