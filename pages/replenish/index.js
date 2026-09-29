const operations = require('../../services/operations');
const forecastStore = require('../../utils/forecast-store');

Page({
  data: {
    loading: true,
    items: [],
    linkedForecast: null,
    pendingCount: 0,
    suggestedTotal: 0
  },

  onLoad() {
    this.loadItems();
  },

  onShow() {
    if (!this.data.loading) {
      this.loadItems();
    }
  },

  loadItems() {
    this.setData({ loading: true });
    operations.getReplenishItems().then((items) => {
      const linkedForecast = forecastStore.getLatestForecastOutput();
      const demandFactor = linkedForecast
        ? Math.min(Math.max(linkedForecast.predictedTrafficFirstDayValue / 1000, 0.75), 1.35)
        : 1;
      const adjustedItems = items.map((item) => ({
        ...item,
        suggested: Math.max(1, Math.ceil(item.suggested * demandFactor)),
        reason: linkedForecast
          ? `${item.reason}；已联动首日预测 ${linkedForecast.predictedTrafficFirstDayValue} 人次，需求系数 ${demandFactor.toFixed(2)}。`
          : item.reason
      }));
      this.setData({
        loading: false,
        items: adjustedItems,
        linkedForecast
      });
      this.updateSummary(adjustedItems);
    });
  },

  toggleHandled(event) {
    const id = event.currentTarget.dataset.id;
    const items = this.data.items.map((item) => {
      if (item.id !== id) {
        return item;
      }
      return {
        ...item,
        handled: !item.handled
      };
    });

    this.setData({ items });
    this.updateSummary(items);
  },

  updateSummary(items) {
    const pendingItems = items.filter((item) => !item.handled);
    const suggestedTotal = pendingItems.reduce((total, item) => total + item.suggested, 0);
    this.setData({
      pendingCount: pendingItems.length,
      suggestedTotal
    });
  }
});
