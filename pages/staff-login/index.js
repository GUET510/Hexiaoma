const app = getApp();

Page({
  data: {
    phoneDisplay: '未授权',
    loading: false,
    manualPhone: '',
    password: ''
  },

  onLoad() {
    const storedPhone = wx.getStorageSync('staffPhone');
    const storedStaffId = wx.getStorageSync('staffId');
    if (storedPhone && storedStaffId) {
      app.globalData.staffPhone = storedPhone;
      app.globalData.staffId = storedStaffId;
      wx.reLaunch({ url: '/pages/verify/index' });
    }
  },

  onGetPhoneNumber(e) {
    const directPhone = e.detail.errMsg === 'getPhoneNumber:ok' ? e.detail.phoneNumber : '';
    if (directPhone) {
      if (!this.data.password) {
        wx.showToast({ title: '请输入员工密码', icon: 'none' });
        return;
      }
      this.loginStaff(directPhone, this.data.password);
      return;
    }
    wx.showToast({ title: '未获取到授权手机号，请重试或手动输入', icon: 'none' });
  },

  onManualPhoneInput(e) {
    this.setData({ manualPhone: (e.detail.value || '').trim() });
  },

  onPasswordInput(e) {
    this.setData({ password: (e.detail.value || '').trim() });
  },

  onManualSubmit() {
    const manualPhone = (this.data.manualPhone || '').trim();
    if (!manualPhone) {
      wx.showToast({ title: '请先输入手机号', icon: 'none' });
      return;
    }
    if (manualPhone.length !== 11) {
      wx.showToast({ title: '手机号需为11位', icon: 'none' });
      return;
    }
    if (!this.data.password) {
      wx.showToast({ title: '请输入员工密码', icon: 'none' });
      return;
    }
    this.loginStaff(manualPhone, this.data.password);
  },

  loginStaff(phone, passwordFromInput) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    if (!phone || phone.toString().length !== 11) {
      wx.showToast({ title: '手机号需为11位', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    wx.request({
      url: `${app.globalData.apiBaseUrl}/api/staff/login`,
      method: 'POST',
      data: { phone, password: passwordFromInput || this.data.password },
      success: (res) => {
        const { staffId, phone: savedPhone, name } = res.data || {};
        if (!staffId) {
          wx.showToast({ title: res.data?.message || '员工不存在', icon: 'none' });
          return;
        }
        app.globalData.staffPhone = savedPhone || phone;
        app.globalData.staffId = staffId;
        wx.setStorageSync('staffPhone', savedPhone || phone);
        wx.setStorageSync('staffId', staffId);
        wx.showToast({ title: `欢迎 ${name || ''}`.trim() || '登录成功', icon: 'success' });
        wx.reLaunch({ url: '/pages/verify/index' });
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
