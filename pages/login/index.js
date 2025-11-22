const app = getApp();

Page({
  data: {
    phoneDisplay: '未授权',
    loading: false,
    manualPhone: ''
  },

  goStaffLogin() {
    wx.navigateTo({ url: '/pages/staff-login/index' });
  },

  onLoad() {
    const storedPhone = wx.getStorageSync('userPhone');
    const storedCustomerId = wx.getStorageSync('customerId');
    if (storedPhone && storedCustomerId) {
      app.globalData.userPhone = storedPhone;
      app.globalData.customerId = storedCustomerId;
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },

  onGetPhoneNumber(e) {
    const directPhone = e.detail.errMsg === 'getPhoneNumber:ok' ? e.detail.phoneNumber : '';

    if (directPhone) {
      this.registerCustomer(directPhone);
      return;
    }

    wx.showToast({ title: '未获取到授权手机号，请重试或手动输入', icon: 'none' });
  },

  onManualPhoneInput(e) {
    this.setData({ manualPhone: (e.detail.value || '').trim() });
  },

  onManualSubmit() {
    const manualPhone = (this.data.manualPhone || '').trim();
    if (!manualPhone) {
      wx.showToast({ title: '请先输入手机号', icon: 'none' });
      return;
    }
    this.registerCustomer(manualPhone);
  },

  registerCustomer(phone) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const apiBaseUrl = app.globalData.apiBaseUrl;

    wx.request({
      url: `${apiBaseUrl}/api/login`,
      method: 'POST',
      data: { phone },
      success: (res) => {
        const { customerId, phone: savedPhone } = res.data || {};
        const phoneDisplay = savedPhone || phone;
        if (!customerId) {
          wx.showToast({ title: '登录失败，稍后重试', icon: 'none' });
          return;
        }
        app.globalData.userPhone = phoneDisplay;
        app.globalData.customerId = customerId;
        wx.setStorageSync('userPhone', phoneDisplay);
        wx.setStorageSync('customerId', customerId);
        wx.showToast({ title: '登录成功', icon: 'success' });
        wx.reLaunch({ url: '/pages/index/index' });
      },
      fail: () => {
        wx.showToast({ title: '网络异常，请检查后端服务', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  }
});
