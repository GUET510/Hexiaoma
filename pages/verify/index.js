const app = getApp();

Page({
  data: {
    scanInput: '',
    verifyMessage: ''
  },

  onLoad() {
    this.ensureStaffLogin();
  },

  onShow() {
    this.ensureStaffLogin();
  },

  ensureStaffLogin() {
    const storedPhone = wx.getStorageSync('staffPhone');
    const storedStaffId = wx.getStorageSync('staffId');
    if (!storedPhone || !storedStaffId) {
      wx.reLaunch({ url: '/pages/staff-login/index' });
    } else {
      app.globalData.staffPhone = storedPhone;
      app.globalData.staffId = storedStaffId;
    }
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
    wx.request({
      url: `${app.globalData.apiBaseUrl}/api/staff/verify`,
      method: 'POST',
      data: { staffId: app.globalData.staffId || wx.getStorageSync('staffId'), code: normalized },
      success: (res) => {
        if (res.data && res.data.success) {
          wx.showToast({ title: '核销成功', icon: 'success' });
          this.setData({ verifyMessage: '核销成功', scanInput: '' });
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
