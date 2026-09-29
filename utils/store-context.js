const TENCENT_PLACE_SEARCH_URL = 'https://apis.map.qq.com/ws/place/v1/search';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits) {
  const factor = Math.pow(10, digits || 0);
  return Math.round(value * factor) / factor;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStore(store) {
  const source = store || {};
  return {
    id: source.id || 'selected-store',
    name: source.name || '未命名门店',
    address: source.address || '待补充地址',
    latitude: toNumber(source.latitude, 31.230416),
    longitude: toNumber(source.longitude, 121.473701),
    category: source.category || '零售',
    businessHours: source.businessHours || '09:00-22:00',
    area: source.area || '待分析商圈',
    baseTraffic: toNumber(source.baseTraffic, 900),
    nearbyStores: Array.isArray(source.nearbyStores) ? source.nearbyStores.slice() : []
  };
}

function haversineDistanceKm(left, right) {
  const latitude1 = toNumber(left && left.latitude, NaN);
  const longitude1 = toNumber(left && left.longitude, NaN);
  const latitude2 = toNumber(right && right.latitude, NaN);
  const longitude2 = toNumber(right && right.longitude, NaN);

  if (![latitude1, longitude1, latitude2, longitude2].every(Number.isFinite)) {
    return NaN;
  }

  const earthRadiusKm = 6371;
  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
    + Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2))
    * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeNearbyStore(item, origin) {
  const source = item || {};
  const location = source.location || {};
  const latitude = toNumber(source.latitude, toNumber(location.lat, NaN));
  const longitude = toNumber(source.longitude, toNumber(location.lng, NaN));
  const measuredDistance = origin && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? haversineDistanceKm(origin, { latitude, longitude })
    : NaN;
  const providedDistance = toNumber(source.distance, NaN);
  const distance = Number.isFinite(providedDistance) ? providedDistance : measuredDistance;

  return {
    id: source.id || source.uid || `nearby-${Math.random().toString(36).slice(2, 8)}`,
    name: source.name || source.title || '周边店铺',
    category: source.category || '零售',
    distance: Number.isFinite(distance) ? round(distance, 2) : 0,
    rating: toNumber(source.rating, 4),
    averageTraffic: toNumber(source.averageTraffic, toNumber(source.footfall, 620)),
    address: source.address || ''
  };
}

function getManualNearbyStores(store, options) {
  const settings = options || {};
  const provided = Array.isArray(settings.nearbyStores)
    ? settings.nearbyStores
    : store.nearbyStores;

  if (provided && provided.length) {
    return provided.map((item) => normalizeNearbyStore(item, store)).sort((left, right) => left.distance - right.distance);
  }

  const count = clamp(Math.round(toNumber(settings.manualNearbyCount, 4)), 0, 30);
  const averageTraffic = clamp(toNumber(settings.manualAverageTraffic, 650), 100, 5000);
  return Array.from({ length: count }, (_, index) => normalizeNearbyStore({
    id: `manual-${index + 1}`,
    name: `手工录入店铺 ${index + 1}`,
    category: settings.manualCategory || store.category,
    distance: round(0.18 + index * 0.22, 2),
    rating: 4,
    averageTraffic
  }, store));
}

function calculateStoreContext(storeInput, options) {
  const settings = options || {};
  const store = normalizeStore(storeInput);
  const nearbyStores = getManualNearbyStores(store, settings);
  const within500m = nearbyStores.filter((item) => item.distance <= 0.5).length;
  const within1km = nearbyStores.filter((item) => item.distance <= 1).length;
  const sameCategoryCount = nearbyStores.filter((item) => item.category === store.category).length;
  const averageNearbyTraffic = nearbyStores.length
    ? nearbyStores.reduce((total, item) => total + item.averageTraffic, 0) / nearbyStores.length
    : 0;
  const averageRating = nearbyStores.length
    ? nearbyStores.reduce((total, item) => total + item.rating, 0) / nearbyStores.length
    : 0;
  const trafficRatio = store.baseTraffic > 0 ? averageNearbyTraffic / store.baseTraffic : 0;
  const densityScore = clamp(within1km / 12, 0, 1);
  const competitionIndex = Math.round(clamp(
    18 + sameCategoryCount * 12 + within500m * 7 + densityScore * 20 + Math.max(averageRating - 4, 0) * 8,
    10,
    96
  ));
  const competitionLevel = competitionIndex <= 35 ? '低' : competitionIndex <= 65 ? '中' : '高';
  const locationFactor = round(clamp(
    1 - (competitionIndex - 50) * 0.0012 + (trafficRatio - 1) * 0.08,
    0.88,
    1.12
  ), 3);
  const locationImpact = round((locationFactor - 1) * 100, 1);

  return {
    source: settings.source || '内置门店样本',
    store,
    nearbyStores,
    nearbyCount: nearbyStores.length,
    within500m,
    within1km,
    sameCategoryCount,
    averageNearbyTraffic: Math.round(averageNearbyTraffic),
    competitionIndex,
    competitionLevel,
    locationFactor,
    locationImpact,
    reasoning: `门店位于${store.area}，1 公里内识别 ${within1km} 家同类或关联店铺，500 米内 ${within500m} 家，竞争指数 ${competitionIndex}（${competitionLevel}），位置因子按 ${locationFactor.toFixed(2)} 计入预测。`
  };
}

function searchNearbyStores(options) {
  const settings = options || {};
  const key = String(settings.key || '').trim();
  const store = normalizeStore(settings.store);

  if (!key) {
    return Promise.resolve({
      places: [],
      message: '未填写腾讯地图 WebService Key，已使用手工周边参数。'
    });
  }

  if (typeof wx === 'undefined' || !wx.request) {
    return Promise.reject(new Error('当前环境不支持地图周边搜索'));
  }

  const radius = clamp(toNumber(settings.radius, 1000), 100, 5000);
  const keyword = String(settings.keyword || '购物').trim() || '购物';
  const url = `${TENCENT_PLACE_SEARCH_URL}?boundary=nearby(${store.latitude},${store.longitude},${radius})&keyword=${encodeURIComponent(keyword)}&page_size=20&orderby=_distance&key=${encodeURIComponent(key)}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout: 15000,
      success: (response) => {
        const payload = response.data || {};
        if (payload.status !== 0) {
          reject(new Error(payload.message || '地图服务返回异常'));
          return;
        }

        const places = (payload.data || []).map((item) => normalizeNearbyStore(item, store));
        resolve({
          places,
          message: `已获取 ${places.length} 家周边店铺，数据用于本次预测。`
        });
      },
      fail: (error) => {
        reject(new Error(error.errMsg || '地图请求失败，请检查域名白名单和 Key。'));
      }
    });
  });
}

module.exports = {
  TENCENT_PLACE_SEARCH_URL,
  calculateStoreContext,
  haversineDistanceKm,
  searchNearbyStores
};
