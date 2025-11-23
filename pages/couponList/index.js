const { request } = require('../../utils/request');
const { makeQrToCanvas } = require('../../utils/qrcode');
const app = getApp();

Page({
  data: {
    coupons: [],
    qrReady: false,
    role: 'user'
  },

  onShow() {
    if (!this.ensureLogin()) return;
    this.setData({ role: app.globalData.userInfo?.role || 'user' });
    this.fetchCoupons();
  },

  ensureLogin() {
    if (app.globalData.userInfo && app.globalData.token) return true;
    const storedUser = wx.getStorageSync('userInfo');
    const storedToken = wx.getStorageSync('token');
    if (storedUser && storedToken) {
      app.cacheUser?.(storedUser, storedToken);
      return true;
    }
    wx.reLaunch({ url: '/pages/login/index' });
    return false;
  },

  fetchCoupons() {
    request({ url: '/coupon/list', method: 'GET' })
      .then((res) => {
        const list = (res && res.coupons) || [];
        const decorated = list.map((item) => this.decorateCoupon(item));
        this.setData({ coupons: decorated, qrReady: decorated.length > 0 }, () => {
          if (decorated.length) {
            this.drawQr(decorated);
          }
        });
      })
      .catch(() => {});
  },

  decorateCoupon(coupon) {
    const created = coupon.createdAt ? new Date(coupon.createdAt.replace(/ /g, 'T')) : null;
    const days = Number(coupon.validDays || coupon.durationDays || coupon.valid_days);
    let validityText = '长期有效';
    if (created && days) {
      const start = created;
      const end = new Date(created.getTime() + days * 24 * 60 * 60 * 1000);
      validityText = `${this.formatDate(start)} 至 ${this.formatDate(end)}`;
    }
    return {
      ...coupon,
      title: coupon.name || coupon.title,
      statusLabel: coupon.status === 'used' ? '已核销' : '未使用',
      validityText,
      storeName: coupon.storeName || coupon.storeScope || '全部门店'
    };
  },

  formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  drawQr(coupons) {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery().in(this);
      coupons.forEach((item) => {
        query.select(`#qr-${item.id}`).fields({ node: true, size: true });
      });
      const size = 220;
      const dpr = wx.getSystemInfoSync().pixelRatio || 1;
      query.exec((nodes) => {
        const tasks = (nodes || []).map((node, index) => {
          const coupon = coupons[index];
          if (!node || !node.node || !coupon) return null;
          const canvas = node.node;
          const ctx = canvas.getContext('2d');
          canvas.width = size * dpr;
          canvas.height = size * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, size, size);
          makeQrToCanvas(coupon.code, { canvasId: `qr-${coupon.id}`, size, ctx });
          return new Promise((resolve) => {
            const done = () => {
              wx.canvasToTempFilePath({
                canvas,
                x: 0,
                y: 0,
                width: size,
                height: size,
                destWidth: size * dpr,
                destHeight: size * dpr,
                success: (file) => resolve({ id: coupon.id, path: file.tempFilePath }),
                fail: () => resolve(null)
              }, this);
            };
            if (typeof canvas.requestAnimationFrame === 'function') {
              canvas.requestAnimationFrame(done);
            } else {
              setTimeout(done, 50);
            }
          });
        }).filter(Boolean);

        Promise.all(tasks).then((images) => {
          const couponsWithQr = this.data.coupons.map((item) => {
            const found = images.find((img) => img && img.id === item.id);
            return found ? { ...item, qrImage: found.path } : item;
          });
          this.setData({ coupons: couponsWithQr });
        });
      });
    });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/createCoupon/index' });
  },

  goVerify() {
    wx.navigateTo({ url: '/pages/verify/index' });
  }
});
