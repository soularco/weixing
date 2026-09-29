const operations = require('../../services/operations');

Page({
  data: {
    loading: true,
    dashboard: null
  },

  onLoad() {
    this.loadDashboard();
  },

  loadDashboard() {
    this.setData({ loading: true });
    operations.getDashboard().then((dashboard) => {
      this.setData({
        loading: false,
        dashboard
      });
    });
  },

  openForecast() {
    wx.switchTab({ url: '/pages/forecast/index' });
  },

  openSchedule() {
    wx.switchTab({ url: '/pages/schedule/index' });
  },

  openReplenish() {
    wx.switchTab({ url: '/pages/replenish/index' });
  }
});
