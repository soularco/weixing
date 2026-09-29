const storeData = require('../../data/store-data');
const storeContextUtil = require('../../utils/store-context');
const forecastStore = require('../../utils/forecast-store');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

Page({
  data: {
    loading: true,
    sampleStores: storeData.sampleStores,
    selectedStoreId: '',
    selectedStore: null,
    mapCenter: {
      latitude: 31.230416,
      longitude: 121.473701
    },
    mapScale: 14,
    markers: [],
    circles: [],
    nearbyStores: [],
    context: null,
    statusMessage: '请选择门店或使用当前位置',
    mapKey: '',
    mapKeyword: '购物',
    mapRadius: 1000,
    manualCount: 4,
    manualAverageTraffic: 650,
    manualCategory: '便利店',
    locating: false,
    searching: false
  },

  onLoad() {
    const saved = forecastStore.getStoreContext();
    const initialStore = saved && saved.store
      ? saved.store
      : storeData.sampleStores[0];
    const manual = {
      manualNearbyCount: saved && saved.nearbyCount ? saved.nearbyCount : 4,
      manualAverageTraffic: saved && saved.averageNearbyTraffic ? saved.averageNearbyTraffic : 650,
      manualCategory: initialStore.category || '便利店'
    };

    this.applySelectedStore(initialStore, {
      source: saved ? '上次保存的门店上下文' : '内置门店样本',
      manualNearbyCount: manual.manualNearbyCount,
      manualAverageTraffic: manual.manualAverageTraffic,
      manualCategory: manual.manualCategory
    });
    this.setData({
      loading: false,
      mapKey: '',
      manualCount: manual.manualNearbyCount,
      manualAverageTraffic: manual.manualAverageTraffic,
      manualCategory: manual.manualCategory
    });
  },

  applySelectedStore(store, options) {
    const settings = options || {};
    const context = storeContextUtil.calculateStoreContext(store, settings);
    const markers = this.buildMarkers(context);
    const circles = this.buildCircles(context);
    forecastStore.saveStoreContext(context);

    this.setData({
      selectedStoreId: store.id,
      selectedStore: context.store,
      mapCenter: {
        latitude: context.store.latitude,
        longitude: context.store.longitude
      },
      markers,
      circles,
      nearbyStores: context.nearbyStores,
      context,
      statusMessage: settings.source || '门店位置已更新'
    });
  },

  buildMarkers(context) {
    const markers = [{
      id: 1,
      latitude: context.store.latitude,
      longitude: context.store.longitude,
      title: context.store.name,
      zIndex: 9,
      iconPath: '/images/map-marker.png',
      width: 28,
      height: 28,
      callout: {
        content: `${context.store.name}\n${context.competitionLevel}竞争`,
        color: '#102f2a',
        fontSize: 12,
        borderRadius: 4,
        padding: 6,
        display: 'ALWAYS'
      }
    }];

    context.nearbyStores.slice(0, 12).forEach((item, index) => {
      const seedLatitude = context.store.latitude + (index % 3 - 1) * 0.002;
      const seedLongitude = context.store.longitude + (Math.floor(index / 3) - 1) * 0.002;
      markers.push({
        id: index + 2,
        latitude: seedLatitude,
        longitude: seedLongitude,
        title: item.name,
        iconPath: '/images/map-marker.png',
        width: 20,
        height: 20,
        callout: {
          content: `${item.name}\n${item.category} · ${item.distance}km`,
          color: '#344054',
          fontSize: 11,
          borderRadius: 4,
          padding: 5,
          display: 'BYCLICK'
        }
      });
    });

    return markers;
  },

  buildCircles(context) {
    return [{
      latitude: context.store.latitude,
      longitude: context.store.longitude,
      radius: 1000,
      color: '#0b6b4f',
      fillColor: '#0b6b4f18',
      strokeWidth: 1
    }];
  },

  selectStore(event) {
    const id = event.currentTarget.dataset.id;
    const store = this.data.sampleStores.find((item) => item.id === id);
    if (!store) {
      return;
    }
    this.applySelectedStore(store, {
      source: `已选择${store.name}`,
      manualNearbyCount: this.data.manualCount,
      manualAverageTraffic: this.data.manualAverageTraffic,
      manualCategory: store.category
    });
  },

  locateCurrentStore() {
    if (!wx.getLocation) {
      wx.showToast({ title: '当前环境不支持定位', icon: 'none' });
      return;
    }

    this.setData({ locating: true });
    wx.getLocation({
      type: 'gcj02',
      success: (location) => {
        const currentStore = {
          id: 'current-store',
          name: '当前位置门店',
          address: '已读取当前定位，可继续用于预测',
          latitude: location.latitude,
          longitude: location.longitude,
          category: this.data.manualCategory || '社区零售',
          businessHours: '09:00-22:00',
          area: '当前位置周边',
          baseTraffic: 900,
          nearbyStores: []
        };
        this.applySelectedStore(currentStore, {
          source: '已读取当前门店定位',
          manualNearbyCount: this.data.manualCount,
          manualAverageTraffic: this.data.manualAverageTraffic,
          manualCategory: currentStore.category
        });
      },
      fail: () => {
        wx.showToast({ title: '定位失败，请检查位置权限', icon: 'none' });
      },
      complete: () => {
        this.setData({ locating: false });
      }
    });
  },

  chooseStoreLocation() {
    if (!wx.chooseLocation) {
      wx.showToast({ title: '当前环境不支持地图选点', icon: 'none' });
      return;
    }

    wx.chooseLocation({
      success: (location) => {
        const chosenStore = {
          id: `chosen-${Date.now()}`,
          name: location.name || '地图选点门店',
          address: location.address || '地图选点',
          latitude: location.latitude,
          longitude: location.longitude,
          category: this.data.manualCategory || '社区零售',
          businessHours: '09:00-22:00',
          area: '地图选点周边',
          baseTraffic: 900,
          nearbyStores: []
        };
        this.applySelectedStore(chosenStore, {
          source: '已更新地图选点门店',
          manualNearbyCount: this.data.manualCount,
          manualAverageTraffic: this.data.manualAverageTraffic,
          manualCategory: chosenStore.category
        });
      },
      fail: () => {
        wx.showToast({ title: '未选择位置', icon: 'none' });
      }
    });
  },

  handleMapKeyInput(event) {
    this.setData({ mapKey: event.detail.value });
  },

  handleKeywordInput(event) {
    this.setData({ mapKeyword: event.detail.value });
  },

  handleRadiusInput(event) {
    const radius = Number(event.detail.value) || 1000;
    this.setData({ mapRadius: Math.min(Math.max(radius, 100), 5000) });
  },

  handleManualCountInput(event) {
    const manualCount = Number(event.detail.value) || 0;
    this.setData({ manualCount: Math.min(Math.max(manualCount, 0), 30) });
  },

  handleManualTrafficInput(event) {
    const manualAverageTraffic = Number(event.detail.value) || 650;
    this.setData({ manualAverageTraffic: Math.min(Math.max(manualAverageTraffic, 100), 5000) });
  },

  handleManualCategoryInput(event) {
    this.setData({ manualCategory: event.detail.value });
  },

  applyManualContext() {
    if (!this.data.selectedStore) {
      return;
    }

    this.applySelectedStore(this.data.selectedStore, {
      source: '已应用手工周边参数',
      manualNearbyCount: this.data.manualCount,
      manualAverageTraffic: this.data.manualAverageTraffic,
      manualCategory: this.data.manualCategory
    });
    wx.showToast({ title: '已更新店周环境', icon: 'success' });
  },

  searchNearby() {
    const key = this.data.mapKey.trim();
    if (!key) {
      this.setData({
        statusMessage: '未填写腾讯地图 Key，请继续使用手工周边参数'
      });
      return;
    }

    this.setData({ searching: true });
    storeContextUtil.searchNearbyStores({
      key,
      store: this.data.selectedStore,
      radius: this.data.mapRadius,
      keyword: this.data.mapKeyword || '购物'
    }).then((result) => {
      if (!result.places.length) {
        this.setData({ statusMessage: result.message || '没有找到周边店铺' });
        return;
      }
      const nextStore = clone(this.data.selectedStore);
      nextStore.nearbyStores = result.places;
      this.applySelectedStore(nextStore, {
        source: `腾讯地图已识别 ${result.places.length} 家周边店铺`,
        nearbyStores: result.places,
        manualCategory: nextStore.category
      });
      wx.showToast({ title: '周边数据已更新', icon: 'success' });
    }).catch((error) => {
      this.setData({ statusMessage: error.message || '地图搜索失败，已保留当前参数' });
      wx.showToast({ title: '地图搜索失败', icon: 'none' });
    }).then(() => {
      this.setData({ searching: false });
    });
  },

  handleMarkerTap(event) {
    const marker = this.data.markers.find((item) => item.id === event.detail.markerId);
    if (marker) {
      this.setData({ statusMessage: marker.title || '已选中地图标记' });
    }
  },

  openForecast() {
    wx.switchTab({ url: '/pages/forecast/index' });
  }
});
