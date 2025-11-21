const app = getApp();
const { makeQrToCanvas } = require('../../utils/qrcode');

Page({
  data: {
    phoneDisplay: '',
    coupons: [],
    activeCoupons: [],
    qrReady: false,
    couponOptions: [
      { id: 'discount200', title: '200元优惠券', faceValue: 200, category: '通用', tip: '日常消费通用' },
      { id: 'oil500', title: '500元油卡券', faceValue: 500, category: '油卡', tip: '加油充值专享' },
      { id: 'service300', title: '300元保养券', faceValue: 300, category: '保养', tip: '汽车保养抵扣' }
    ],
    selectedCouponId: 'discount200'
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

  onSelectCoupon(e) {
    this.setData({ selectedCouponId: e.detail.value });
  },

  generateCoupon() {
    if (!app.globalData.userPhone) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    const preset = this.data.couponOptions.find(item => item.id === this.data.selectedCouponId);
    if (!preset) {
      wx.showToast({ title: '请选择要生成的优惠券', icon: 'none' });
      return;
    }

    const timestamp = Date.now();
    const createdAt = this.formatTime(new Date());
    const newCoupon = {
      id: `${preset.id}-${timestamp}`,
      code: `HX-${preset.faceValue}-${timestamp}`,
      title: preset.title,
      faceValue: preset.faceValue,
      category: preset.category,
      status: 'active',
      createdAt
    };

    const existingCoupons = wx.getStorageSync('coupons') || [];
    const coupons = [newCoupon, ...existingCoupons];
    const active = coupons.filter(item => item.status === 'active');
    app.globalData.coupons = coupons;
    wx.setStorageSync('coupons', coupons);

    this.setData({
      coupons: coupons.map(coupon => this.decorateCoupon(coupon)),
      activeCoupons: active.map(coupon => this.decorateCoupon(coupon)),
      qrReady: active.length > 0
    }, () => {
      if (active.length > 0) {
        this.drawQrBatch(active);
      }
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
