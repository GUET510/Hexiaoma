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
    const storedCustomerId = wx.getStorageSync('customerId');
    if (!storedPhone || !storedCustomerId) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    this.setData({ phoneDisplay: storedPhone });
    app.globalData.userPhone = storedPhone;
    app.globalData.customerId = storedCustomerId;
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
        const active = coupons.filter(item => item.status === 'active');
        const decoratedCoupons = coupons.map(coupon => this.decorateCoupon(coupon));
        const decoratedActive = active.map(coupon => this.decorateCoupon(coupon));
        this.setData({
          coupons: decoratedCoupons,
          activeCoupons: decoratedActive,
          qrReady: decoratedActive.length > 0
        }, () => {
          if (decoratedActive.length > 0) {
            this.drawQrBatch(decoratedActive);
          }
        });
        wx.setStorageSync('coupons', coupons);
        app.globalData.coupons = coupons;
      },
      fail: () => {
        wx.showToast({ title: '获取优惠券失败，请检查后端服务', icon: 'none' });
      }
    });
  },

  onSelectCoupon(e) {
    this.setData({ selectedCouponId: e.detail.value });
  },

  generateCoupon() {
    if (!app.globalData.userPhone || !app.globalData.customerId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    const preset = this.data.couponOptions.find(item => item.id === this.data.selectedCouponId);
    if (!preset) {
      wx.showToast({ title: '请选择要生成的优惠券', icon: 'none' });
      return;
    }

    wx.request({
      url: `${app.globalData.apiBaseUrl}/api/coupons`,
      method: 'POST',
      data: {
        customerId: app.globalData.customerId,
        templateId: preset.id
      },
      success: () => {
        wx.showToast({ title: '生成成功', icon: 'success' });
        this.syncCoupons();
      },
      fail: () => {
        wx.showToast({ title: '生成失败，请检查后端服务', icon: 'none' });
      }
    });
  },

  goVerify() {
    wx.navigateTo({ url: '/pages/verify/index' });
  },

  drawQrBatch(coupons) {
    if (!coupons || !coupons.length) {
      this.setData({ qrReady: false });
      return;
    }

    // 确保页面渲染完成后再选择 canvas，否则节点可能为空导致不绘制
    wx.nextTick(() => {
      const query = wx.createSelectorQuery().in(this);
      const size = 260;
      coupons.forEach((coupon) => {
        query.select(`#qr-${coupon.id}`).fields({ node: true, size: true });
      });

      query.exec((res) => {
        if (!res || !res.length) {
          console.warn('未获取到二维码节点');
          return;
        }

        const dpr = wx.getSystemInfoSync().pixelRatio || 1;
        const tasks = res.map((item, index) => {
          const coupon = coupons[index];
          if (!coupon || !item || !item.node) return null;
          const canvas = item.node;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          canvas.width = size * dpr;
          canvas.height = size * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, size, size);
          makeQrToCanvas(coupon.code, { canvasId: `qr-${coupon.id}`, size, ctx });

          return new Promise((resolve) => {
            const exportToImage = () => {
              wx.canvasToTempFilePath({
                canvas,
                x: 0,
                y: 0,
                width: size,
                height: size,
                destWidth: size * dpr,
                destHeight: size * dpr,
                success: (fileRes) => resolve({ id: coupon.id, path: fileRes.tempFilePath }),
                fail: () => resolve(null)
              }, this);
            };

            if (typeof canvas.requestAnimationFrame === 'function') {
              canvas.requestAnimationFrame(exportToImage);
            } else {
              setTimeout(exportToImage, 50);
            }
          });
        }).filter(Boolean);

        if (!tasks.length) {
          this.setData({ qrReady: false });
          return;
        }

        Promise.all(tasks).then((images) => {
          if (!images.length) return;
          const activeCoupons = this.data.activeCoupons.map((item) => {
            const found = images.find(img => img && img.id === item.id);
            return found ? { ...item, qrImage: found.path } : item;
          });
          this.setData({ activeCoupons });
        });
      });
    });
  },

  decorateCoupon(coupon) {
    return {
      ...coupon,
      statusLabel: coupon.status === 'used' ? '已核销' : '未核销'
    };
  }
});
