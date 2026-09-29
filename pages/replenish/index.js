const operations = require('../../services/operations');

Page({
  data: {
    loading: true,
    items: [],
    pendingCount: 0,
    suggestedTotal: 0
  },

  onLoad() {
    this.loadItems();
  },

  loadItems() {
    this.setData({ loading: true });
    operations.getReplenishItems().then((items) => {
      this.setData({
        loading: false,
        items
      });
      this.updateSummary(items);
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
