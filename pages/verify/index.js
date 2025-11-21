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
    const storedCustomerId = wx.getStorageSync('customerId');
    if (!storedPhone || !storedCustomerId) {
      wx.reLaunch({ url: '/pages/login/index' });
    } else {
      app.globalData.userPhone = storedPhone;
      app.globalData.customerId = storedCustomerId;
    }
  },

  syncCoupons() {
    const customerId = app.globalData.customerId || wx.getStorageSync('customerId');
    if (!customerId) return;
    wx.request({
      url: `${app.globalData.apiBaseUrl}/api/coupons`,
      method: 'GET',
      data: { customerId },
      success: (res) => {
        const coupons = (res.data && res.data.coupons) || [];
        this.setData({ coupons });
        app.globalData.coupons = coupons;
      }
    });
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
    this.verifyCoupon(this.data.scanInput);
  },

  verifyCoupon(code) {
    const normalized = (code || '').trim();
    if (!normalized) {
      wx.showToast({ title: '请输入核销码', icon: 'none' });
      return;
    }
    const customerId = app.globalData.customerId;
    wx.request({
      url: `${app.globalData.apiBaseUrl}/api/coupons/verify`,
      method: 'POST',
      data: { customerId, code: normalized },
      success: (res) => {
        if (res.data && res.data.success) {
          wx.showToast({ title: '核销成功', icon: 'success' });
          this.setData({ verifyMessage: '核销成功', scanInput: '' });
          this.syncCoupons();
        } else {
          this.setData({ verifyMessage: res.data && res.data.message ? res.data.message : '核销失败' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络异常，稍后再试', icon: 'none' });
      }
    });
  }
});
