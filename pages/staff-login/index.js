const { request } = require('../../utils/request');
const app = getApp();

Page({
  data: {
    phone: '',
    password: '',
    loading: false
  },

  onPhoneInput(e) {
    this.setData({ phone: (e.detail.value || '').trim() });
  },

  onPwdInput(e) {
    this.setData({ password: e.detail.value });
  },

  onSubmit() {
    const { phone, password, loading } = this.data;
    if (loading) return;
    if (!/^\d{11}$/.test(phone)) {
      wx.showToast({ title: '请输入11位手机号', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    request({
      url: '/auth/loginByPhone',
      method: 'POST',
      data: { phone, password, role: 'staff' }
    })
      .then((res) => {
        if (res && res.token && res.user) {
          app.cacheUser(res.user, res.token);
          wx.showToast({ title: '员工登录成功', icon: 'success' });
          wx.reLaunch({ url: '/pages/verify/index' });
        }
      })
      .catch(() => {})
      .finally(() => this.setData({ loading: false }));
  }
});
