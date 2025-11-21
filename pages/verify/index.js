const app = getApp();

Page({
  data: {
    scanInput: '',
    verifyMessage: '',
    coupons: []
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
    } else {
      app.globalData.userPhone = storedPhone;
    }
  },

  syncCoupons() {
    const storedCoupons = wx.getStorageSync('coupons') || [];
    this.setData({ coupons: storedCoupons });
    app.globalData.coupons = storedCoupons;
  },

  scanCoupon() {
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
    this.setData({ coupons, verifyMessage: '核销成功' });
    app.globalData.coupons = coupons;
    wx.setStorageSync('coupons', coupons);
  }
});
