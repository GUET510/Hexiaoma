const app = getApp();

Page({
  data: {
    phoneDisplay: '未授权',
    loading: false
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
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      const phone = e.detail.phoneNumber || e.detail.code || '用户手机号已授权';
      this.registerCustomer(phone);
    } else {
      wx.showToast({ title: '需要手机号授权', icon: 'none' });
    }
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
