const operations = require('../../services/operations');

Page({
  data: {
    loading: true,
    schedule: null,
    generated: false
  },

  onLoad() {
    this.loadSchedule();
  },

  loadSchedule() {
    this.setData({ loading: true });
    operations.getSchedule().then((schedule) => {
      this.setData({
        loading: false,
        schedule
      });
    });
  },

  generateSchedule() {
    this.setData({
      generated: true
    });
    wx.showToast({
      title: '已生成建议',
      icon: 'success'
    });
  }
});
