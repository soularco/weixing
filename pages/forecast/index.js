const operations = require('../../services/operations');

Page({
  data: {
    loading: true,
    range: 'tomorrow',
    rangeOptions: [
      { label: '明天', value: 'tomorrow' },
      { label: '未来 3 天', value: 'threeDays' },
      { label: '未来 7 天', value: 'week' }
    ],
    forecast: null
  },

  onLoad() {
    this.loadForecast('tomorrow');
  },

  selectRange(event) {
    const range = event.currentTarget.dataset.range;
    if (range !== this.data.range) {
      this.loadForecast(range);
    }
  },

  loadForecast(range) {
    this.setData({
      loading: true,
      range
    });

    operations.getForecast(range).then((forecast) => {
      this.setData({
        loading: false,
        forecast
      });
    });
  }
});
