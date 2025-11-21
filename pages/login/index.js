const app = getApp();

Page({
  data: {
    phoneDisplay: '未授权'
  },

  onLoad() {
    const storedPhone = wx.getStorageSync('userPhone');
    if (storedPhone) {
      app.globalData.userPhone = storedPhone;
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },

  onGetPhoneNumber(e) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      const masked = '用户手机号已授权';
      app.globalData.userPhone = masked;
      wx.setStorageSync('userPhone', masked);
      wx.showToast({ title: '登录成功', icon: 'success' });
      wx.reLaunch({ url: '/pages/index/index' });
    } else {
      wx.showToast({ title: '需要手机号授权', icon: 'none' });
    }
  }
});
