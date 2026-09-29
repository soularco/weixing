const dashboard = {
  storeName: '示范门店 A',
  updatedAt: '今日 18:20',
  metrics: [
    {
      label: '明日预估客流',
      value: '1,280',
      unit: '人次',
      detail: '较上周同日 +12%'
    },
    {
      label: '建议在岗人数',
      value: '9',
      unit: '人',
      detail: '高峰时段 18:00-20:00'
    },
    {
      label: '待补货 SKU',
      value: '6',
      unit: '项',
      detail: '其中 2 项为高优先级'
    },
    {
      label: '风险提醒',
      value: '2',
      unit: '条',
      detail: '库存与人力各 1 条'
    }
  ],
  actions: [
    {
      title: '提前安排晚高峰收银支援',
      desc: '预计 18:00-20:00 客流达到全天峰值，建议从理货岗调配 1 人。',
      level: '高'
    },
    {
      title: '补充冷藏鲜奶和即食便当',
      desc: '当前库存预计只能支撑 0.7 天，周末客流将放大缺货风险。',
      level: '中'
    },
    {
      title: '复核周二晚班技能覆盖',
      desc: '晚班缺少一名可独立处理退换货的员工。',
      level: '中'
    }
  ]
};

const forecastByRange = {
  tomorrow: {
    rangeLabel: '明天',
    predictedTraffic: '1,280',
    predictedSales: '84,200',
    confidence: 87,
    changeText: '较上周同日 +12%',
    peakLabel: '18:00-20:00',
    bars: [
      { label: '10', value: 28 },
      { label: '12', value: 42 },
      { label: '14', value: 52 },
      { label: '16', value: 68 },
      { label: '18', value: 96 },
      { label: '20', value: 76 },
      { label: '22', value: 35 }
    ],
    drivers: [
      '周边商圈周末活动带来额外客流',
      '过去四周同一时段平均增长 9%',
      '天气晴，预计到店率提升'
    ]
  },
  threeDays: {
    rangeLabel: '未来 3 天',
    predictedTraffic: '3,540',
    predictedSales: '231,600',
    confidence: 82,
    changeText: '较上周同期 +8%',
    peakLabel: '周六 18:00-20:00',
    bars: [
      { label: '周五', value: 72 },
      { label: '周六', value: 100 },
      { label: '周日', value: 84 }
    ],
    drivers: [
      '周六晚间为三天内最高峰',
      '周日午后亲子客群可能增加',
      '预计促销活动提升客单价'
    ]
  },
  week: {
    rangeLabel: '未来 7 天',
    predictedTraffic: '7,860',
    predictedSales: '512,400',
    confidence: 76,
    changeText: '较上周同期 +6%',
    peakLabel: '周六晚间',
    bars: [
      { label: '周一', value: 52 },
      { label: '周二', value: 48 },
      { label: '周三', value: 55 },
      { label: '周四', value: 61 },
      { label: '周五', value: 78 },
      { label: '周六', value: 100 },
      { label: '周日', value: 82 }
    ],
    drivers: [
      '周末贡献预计占七天总客流的 34%',
      '工作日午间客流保持稳定',
      '当前预测随着日期临近会自动提高置信度'
    ]
  }
};

const schedule = {
  dateLabel: '10 月 1 日 周四',
  coverage: [
    { label: '建议人数', value: '9 人' },
    { label: '技能覆盖', value: '92%' },
    { label: '人力成本', value: '3,240 元' }
  ],
  shifts: [
    {
      id: 'morning',
      name: '早班',
      time: '09:00-17:00',
      people: 4,
      focus: '开档、收货、陈列、早间收银'
    },
    {
      id: 'middle',
      name: '中班',
      time: '12:00-20:00',
      people: 2,
      focus: '午间高峰、库存整理、客户服务'
    },
    {
      id: 'evening',
      name: '晚班',
      time: '16:00-22:00',
      people: 3,
      focus: '晚高峰收银、补货、闭店'
    }
  ],
  risks: [
    '晚班仍缺少一名可独立处理退换货的员工。',
    '18:00-20:00 建议保留一名机动人员。'
  ]
};

const replenishItems = [
  {
    id: 'sku-01',
    name: '冷藏鲜奶 950ml',
    stock: 12,
    suggested: 36,
    reason: '预计周末客流上升，当前库存可支撑 0.7 天',
    urgency: '高',
    handled: false
  },
  {
    id: 'sku-02',
    name: '即食便当组合装',
    stock: 18,
    suggested: 30,
    reason: '晚高峰销量通常比午间高 45%',
    urgency: '高',
    handled: false
  },
  {
    id: 'sku-03',
    name: '瓶装无糖茶饮',
    stock: 42,
    suggested: 24,
    reason: '促销活动预计提升销量，但现有库存仍可覆盖 1.4 天',
    urgency: '中',
    handled: false
  },
  {
    id: 'sku-04',
    name: '一次性雨伞',
    stock: 8,
    suggested: 15,
    reason: '天气预测显示周末可能出现短时降雨',
    urgency: '中',
    handled: false
  }
];

module.exports = {
  dashboard,
  forecastByRange,
  schedule,
  replenishItems
};
