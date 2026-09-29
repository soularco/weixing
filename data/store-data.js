const sampleStores = [
  {
    id: 'store-a',
    name: '示范门店 A',
    address: '上海市静安区示范路 88 号',
    latitude: 31.230416,
    longitude: 121.473701,
    category: '社区零售',
    businessHours: '09:00-22:00',
    area: '社区商圈',
    baseTraffic: 860,
    nearbyStores: [
      { id: 'nearby-a1', name: '邻家便利店', category: '便利店', distance: 0.22, rating: 4.2, averageTraffic: 620 },
      { id: 'nearby-a2', name: '鲜食生活馆', category: '生鲜零售', distance: 0.48, rating: 4.5, averageTraffic: 880 },
      { id: 'nearby-a3', name: '地铁口饮品店', category: '饮品', distance: 0.71, rating: 4.1, averageTraffic: 540 },
      { id: 'nearby-a4', name: '社区超市', category: '超市', distance: 1.14, rating: 4.0, averageTraffic: 760 }
    ]
  },
  {
    id: 'store-b',
    name: '示范门店 B',
    address: '上海市浦东新区示范大道 126 号',
    latitude: 31.221889,
    longitude: 121.544321,
    category: '写字楼零售',
    businessHours: '08:30-21:30',
    area: '写字楼商圈',
    baseTraffic: 1040,
    nearbyStores: [
      { id: 'nearby-b1', name: '写字楼便利店', category: '便利店', distance: 0.18, rating: 4.4, averageTraffic: 910 },
      { id: 'nearby-b2', name: '轻食工坊', category: '餐饮', distance: 0.35, rating: 4.3, averageTraffic: 680 },
      { id: 'nearby-b3', name: '精品咖啡', category: '饮品', distance: 0.52, rating: 4.6, averageTraffic: 720 },
      { id: 'nearby-b4', name: '地下商业街', category: '综合商业', distance: 0.86, rating: 4.1, averageTraffic: 1200 }
    ]
  },
  {
    id: 'store-c',
    name: '示范门店 C',
    address: '上海市徐汇区示范街 66 号',
    latitude: 31.188891,
    longitude: 121.436401,
    category: '交通枢纽零售',
    businessHours: '07:00-23:00',
    area: '交通枢纽商圈',
    baseTraffic: 1260,
    nearbyStores: [
      { id: 'nearby-c1', name: '交通站便利店', category: '便利店', distance: 0.12, rating: 4.0, averageTraffic: 1380 },
      { id: 'nearby-c2', name: '站前快餐', category: '餐饮', distance: 0.26, rating: 4.2, averageTraffic: 980 },
      { id: 'nearby-c3', name: '旅行用品店', category: '非食品零售', distance: 0.45, rating: 4.1, averageTraffic: 430 },
      { id: 'nearby-c4', name: '咖啡烘焙', category: '饮品', distance: 0.78, rating: 4.4, averageTraffic: 610 }
    ]
  }
];

module.exports = {
  sampleStores
};
