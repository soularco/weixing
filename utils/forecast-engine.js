const FIELD_ALIASES = {
  date: ['date', '日期', '时间', '营业日期'],
  traffic: ['traffic', '客流', '客流量', '进店人数', 'visitors'],
  sales: ['sales', '销售额', '营收', '营业额', 'revenue'],
  staff: ['staff', '员工', '员工数', '在岗人数', '人力'],
  stock: ['stock', '库存', '库存量'],
  members: ['members', '会员', '会员数', '会员客流'],
  miniProgram: ['miniprogram', 'mini', '小程序', '小程序客流'],
  referral: ['referral', '转介绍', '推荐客流', '推荐'],
  promo: ['promo', '促销', '活动', '促销标记'],
  weather: ['weather', '天气']
};

const DEFAULT_DISTRIBUTION = [
  { label: '线下散客', value: 48, color: '#0b6b4f' },
  { label: '会员客流', value: 24, color: '#2f6fed' },
  { label: '小程序客流', value: 18, color: '#d97706' },
  { label: '转介绍', value: 10, color: '#7a5af8' }
];

const FIELD_LOOKUP = Object.keys(FIELD_ALIASES).reduce((lookup, canonical) => {
  FIELD_ALIASES[canonical].forEach((alias) => {
    lookup[normalizeHeader(alias)] = canonical;
  });
  return lookup;
}, {});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits) {
  const factor = Math.pow(10, digits || 0);
  return Math.round(value * factor) / factor;
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function parseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  if (value === null || value === undefined || value === '') {
    return NaN;
  }

  const normalized = String(value)
    .replace(/,/g, '')
    .replace(/[¥￥元人次个]/g, '')
    .replace(/%/g, '')
    .trim();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  return /^(1|true|yes|y|是|有|促销)$/i.test(String(value || '').trim());
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().replace(/[./]/g, '-');
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date) {
  if (!date) {
    return '';
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

function formatDateLong(date) {
  if (!date) {
    return '';
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatNumber(value) {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPercent(value, digits) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${round(value, digits === undefined ? 1 : digits)}%`;
}

function splitDelimitedLine(line, delimiter) {
  const result = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === delimiter && !quoted) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  result.push(current.trim());
  return result;
}

function detectDelimiter(headerLine) {
  const candidates = [',', '\t', ';'];
  return candidates.reduce((selected, delimiter) => {
    const count = headerLine.split(delimiter).length;
    return count > selected.count ? { delimiter, count } : selected;
  }, { delimiter: ',', count: 0 }).delimiter;
}

function normalizeRows(rawRows) {
  const rows = [];
  let invalidCount = 0;

  rawRows.forEach((rawRow, index) => {
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
      invalidCount += 1;
      return;
    }

    const mapped = {};
    Object.keys(rawRow).forEach((key) => {
      const canonical = FIELD_LOOKUP[normalizeHeader(key)];
      if (canonical) {
        mapped[canonical] = rawRow[key];
      }
    });

    const traffic = parseNumber(mapped.traffic);
    const sales = parseNumber(mapped.sales);

    if (!Number.isFinite(traffic) || !Number.isFinite(sales) || traffic < 0 || sales < 0) {
      invalidCount += 1;
      return;
    }

    rows.push({
      date: mapped.date ? String(mapped.date).trim() : `第 ${index + 1} 天`,
      traffic,
      sales,
      staff: Number.isFinite(parseNumber(mapped.staff)) ? parseNumber(mapped.staff) : null,
      stock: Number.isFinite(parseNumber(mapped.stock)) ? parseNumber(mapped.stock) : null,
      members: Number.isFinite(parseNumber(mapped.members)) ? parseNumber(mapped.members) : null,
      miniProgram: Number.isFinite(parseNumber(mapped.miniProgram)) ? parseNumber(mapped.miniProgram) : null,
      referral: Number.isFinite(parseNumber(mapped.referral)) ? parseNumber(mapped.referral) : null,
      promo: parseFlag(mapped.promo),
      weather: mapped.weather ? String(mapped.weather).trim() : ''
    });
  });

  const parsedDates = rows.map((row) => parseDate(row.date));
  if (parsedDates.every(Boolean)) {
    rows.sort((left, right) => parseDate(left.date).getTime() - parseDate(right.date).getTime());
  }

  return { rows, invalidCount };
}

function parseImportText(text) {
  if (!text || !String(text).trim()) {
    throw new Error('导入内容为空');
  }

  const source = String(text).trim();
  let rawRows;

  if (source[0] === '[' || source[0] === '{') {
    const payload = JSON.parse(source);
    rawRows = Array.isArray(payload) ? payload : payload.rows;
  } else {
    const lines = source.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error('至少需要一行表头和一行数据');
    }

    const delimiter = detectDelimiter(lines[0]);
    const headers = splitDelimitedLine(lines[0], delimiter);
    rawRows = lines.slice(1).map((line) => {
      const values = splitDelimitedLine(line, delimiter);
      return headers.reduce((row, header, index) => {
        row[header] = values[index];
        return row;
      }, {});
    });
  }

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error('未找到可导入的数据行');
  }

  const normalized = normalizeRows(rawRows);
  if (normalized.rows.length < 3) {
    throw new Error('有效数据少于 3 行，无法进行趋势预测');
  }

  return {
    rows: normalized.rows,
    meta: {
      sourceType: source[0] === '[' || source[0] === '{' ? 'JSON' : 'CSV',
      rawCount: rawRows.length,
      validCount: normalized.rows.length,
      invalidCount: normalized.invalidCount
    }
  };
}

function rowsToCsv(rows) {
  const headers = ['date', 'traffic', 'sales', 'staff', 'stock', 'members', 'miniProgram', 'referral', 'promo'];
  const lines = [headers.join(',')];

  rows.forEach((row) => {
    lines.push([
      row.date,
      row.traffic,
      row.sales,
      row.staff === null || row.staff === undefined ? '' : row.staff,
      row.stock === null || row.stock === undefined ? '' : row.stock,
      row.members === null || row.members === undefined ? '' : row.members,
      row.miniProgram === null || row.miniProgram === undefined ? '' : row.miniProgram,
      row.referral === null || row.referral === undefined ? '' : row.referral,
      row.promo ? 1 : 0
    ].join(','));
  });

  return lines.join('\n');
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  const variance = mean(values.map((value) => Math.pow(value - average, 2)));
  return Math.sqrt(variance);
}

function weightedAverage(values) {
  if (!values.length) {
    return 0;
  }

  let weightedTotal = 0;
  let weightTotal = 0;
  values.forEach((value, index) => {
    const weight = index + 1;
    weightedTotal += value * weight;
    weightTotal += weight;
  });

  return weightedTotal / weightTotal;
}

function linearRegression(values) {
  if (values.length < 2) {
    return { intercept: values[0] || 0, slope: 0 };
  }

  const xAverage = (values.length - 1) / 2;
  const yAverage = mean(values);
  let numerator = 0;
  let denominator = 0;

  values.forEach((value, index) => {
    numerator += (index - xAverage) * (value - yAverage);
    denominator += Math.pow(index - xAverage, 2);
  });

  const slope = denominator === 0 ? 0 : numerator / denominator;
  return {
    intercept: yAverage - slope * xAverage,
    slope
  };
}

function calculateMape(actualValues, predictedValues) {
  const pairs = actualValues
    .map((actual, index) => ({ actual, predicted: predictedValues[index] }))
    .filter((pair) => Number.isFinite(pair.actual) && Number.isFinite(pair.predicted) && pair.actual !== 0);

  if (!pairs.length) {
    return null;
  }

  const total = pairs.reduce((sum, pair) => sum + Math.abs((pair.actual - pair.predicted) / pair.actual), 0);
  return (total / pairs.length) * 100;
}

function buildModelComparison(rows) {
  const actual = [];
  const naive = [];
  const moving = [];
  const trend = [];

  rows.forEach((row, index) => {
    if (index < 3) {
      return;
    }

    const priorRows = rows.slice(0, index);
    const priorValues = priorRows.map((item) => item.traffic);
    const regression = linearRegression(priorValues);
    actual.push(row.traffic);
    naive.push(priorValues[priorValues.length - 1]);
    moving.push(mean(priorValues.slice(-3)));
    trend.push(regression.intercept + regression.slope * priorValues.length);
  });

  const comparison = [
    { name: '最近值法', mape: calculateMape(actual, naive) },
    { name: '3 日移动平均', mape: calculateMape(actual, moving) },
    { name: '线性趋势', mape: calculateMape(actual, trend) }
  ].filter((item) => item.mape !== null);

  return comparison
    .sort((left, right) => left.mape - right.mape)
    .map((item, index) => ({
      ...item,
      mapeText: `${round(item.mape, 1)}%`,
      recommended: index === 0
    }));
}

function buildWeekdayFactors(rows) {
  const overallAverage = mean(rows.map((row) => row.traffic));
  const buckets = Array.from({ length: 7 }, () => []);
  let hasDates = true;

  rows.forEach((row) => {
    const date = parseDate(row.date);
    if (!date) {
      hasDates = false;
      return;
    }
    buckets[date.getDay()].push(row.traffic);
  });

  if (!hasDates || overallAverage === 0) {
    return Array(7).fill(1);
  }

  return buckets.map((values) => {
    if (values.length < 2) {
      return 1;
    }
    return clamp(mean(values) / overallAverage, 0.92, 1.08);
  });
}

function buildTrendPoints(rows, futureRows) {
  const historyPoints = rows.slice(-10).map((row) => ({
    label: formatDate(parseDate(row.date)) || row.date,
    actual: row.traffic,
    forecast: null,
    low: null,
    high: null
  }));

  const futurePoints = futureRows.map((row) => ({
    label: row.label,
    actual: null,
    forecast: row.traffic,
    low: row.low,
    high: row.high
  }));

  return historyPoints.concat(futurePoints);
}

function buildDistribution(rows) {
  const recent = rows.slice(-14);
  const memberTotal = recent.reduce((total, row) => total + (row.members || 0), 0);
  const miniTotal = recent.reduce((total, row) => total + (row.miniProgram || 0), 0);
  const referralTotal = recent.reduce((total, row) => total + (row.referral || 0), 0);

  if (!memberTotal && !miniTotal && !referralTotal) {
    return DEFAULT_DISTRIBUTION;
  }

  const trafficTotal = recent.reduce((total, row) => total + row.traffic, 0);
  const otherTotal = Math.max(trafficTotal - memberTotal - miniTotal - referralTotal, 0);
  const baseValues = [
    { label: '线下散客', value: otherTotal, color: '#0b6b4f' },
    { label: '会员客流', value: memberTotal, color: '#2f6fed' },
    { label: '小程序客流', value: miniTotal, color: '#d97706' },
    { label: '转介绍', value: referralTotal, color: '#7a5af8' }
  ];

  const total = baseValues.reduce((sum, item) => sum + item.value, 0) || 1;
  const percentages = baseValues.map((item) => Math.round((item.value / total) * 100));
  const roundedTotal = percentages.reduce((sum, value) => sum + value, 0);
  let largestIndex = 0;
  percentages.forEach((value, index) => {
    if (value > percentages[largestIndex]) {
      largestIndex = index;
    }
  });
  percentages[largestIndex] = Math.max(percentages[largestIndex] + (100 - roundedTotal), 0);

  return baseValues.map((item, index) => ({
    ...item,
    value: percentages[index]
  }));
}

function buildDataQuality(rows) {
  const trafficValues = rows.map((row) => row.traffic);
  const average = mean(trafficValues);
  const deviation = standardDeviation(trafficValues);
  const outliers = deviation === 0
    ? 0
    : trafficValues.filter((value) => Math.abs(value - average) / deviation > 2.5).length;
  const dates = rows.map((row) => parseDate(row.date)).filter(Boolean);
  const completeness = rows.length
    ? (rows.filter((row) => row.date && Number.isFinite(row.traffic) && Number.isFinite(row.sales)).length / rows.length) * 100
    : 0;
  const score = Math.round(clamp(completeness - (outliers / Math.max(rows.length, 1)) * 25, 55, 100));

  return {
    score,
    rows: rows.length,
    outliers,
    completeness: Math.round(completeness),
    range: dates.length >= 2
      ? `${formatDateLong(dates[0])} 至 ${formatDateLong(dates[dates.length - 1])}`
      : '未提供标准日期'
  };
}

function buildDrivers(rows, confidence, scenarioMultiplier) {
  const recent = rows.slice(-14);
  const trafficValues = recent.map((row) => row.traffic);
  const salesValues = recent.map((row) => row.sales);
  const firstTraffic = trafficValues[0] || 1;
  const lastTraffic = trafficValues[trafficValues.length - 1] || firstTraffic;
  const trendChange = ((lastTraffic - firstTraffic) / firstTraffic) * 100;
  const volatility = mean(trafficValues) ? (standardDeviation(trafficValues) / mean(trafficValues)) * 100 : 0;
  const ticketValues = recent.map((row) => row.sales / Math.max(row.traffic, 1));
  const ticketChange = ticketValues.length > 1
    ? ((ticketValues[ticketValues.length - 1] - ticketValues[0]) / Math.max(ticketValues[0], 1)) * 100
    : 0;
  const promoCount = recent.filter((row) => row.promo).length;

  return [
    ...(scenarioMultiplier !== 1 ? [{
      title: '情景倍率模拟',
      impact: `${round(scenarioMultiplier, 2)}×`,
      direction: scenarioMultiplier > 1 ? '增量' : '收缩',
      strength: Math.abs(scenarioMultiplier - 1) >= 0.1 ? '高' : '中',
      reason: `已按 ${round(scenarioMultiplier, 2)} 倍情景系数调整基础客流，用于模拟促销、天气或活动变化。`
    }] : []),
    {
      title: '近期客流趋势',
      impact: formatPercent(trendChange),
      direction: trendChange >= 0 ? '上升' : '下降',
      strength: Math.abs(trendChange) >= 8 ? '高' : Math.abs(trendChange) >= 3 ? '中' : '低',
      reason: `最近 ${recent.length} 天首尾客流变化为 ${formatPercent(trendChange)}，趋势项已按较高权重计入。`
    },
    {
      title: '历史波动水平',
      impact: `${round(volatility, 1)}%`,
      direction: volatility <= 10 ? '稳定' : '波动',
      strength: volatility <= 10 ? '高' : volatility <= 18 ? '中' : '低',
      reason: `客流离散度为 ${round(volatility, 1)}%，波动越小，预测置信区间越窄。`
    },
    {
      title: '客单价变化',
      impact: formatPercent(ticketChange),
      direction: ticketChange >= 0 ? '提升' : '回落',
      strength: Math.abs(ticketChange) >= 5 ? '中' : '低',
      reason: '基于销售额除以客流计算，客单价变化会影响销售额预测，但不会直接放大客流。'
    },
    {
      title: '促销与活动',
      impact: promoCount ? `命中 ${promoCount} 天` : '无标记',
      direction: promoCount ? '增量' : '中性',
      strength: promoCount ? '中' : '低',
      reason: promoCount
        ? `最近 ${recent.length} 天中有 ${promoCount} 天标记促销，模型中按活动增量处理。`
        : '导入数据未提供促销标记，因此不额外增加活动客流。'
    },
    {
      title: '模型置信度',
      impact: `${confidence}%`,
      direction: confidence >= 85 ? '较高' : confidence >= 75 ? '中等' : '谨慎',
      strength: confidence >= 85 ? '高' : confidence >= 75 ? '中' : '低',
      reason: '置信度根据样本数量、历史波动和预测跨度综合计算，不表示结果绝对准确。'
    }
  ];
}

function buildReasonSummary(horizon, predictedTraffic, predictedSales, changeValue, confidence, factors) {
  const horizonText = horizon === 1 ? '下一营业日' : `未来 ${horizon} 天`;
  const directionText = changeValue >= 0 ? '增长' : '下降';
  const mainFactor = factors[0] ? factors[0].title : '历史趋势';
  return `${horizonText}预计客流 ${formatNumber(predictedTraffic)} 人次、销售额 ${formatNumber(predictedSales)} 元，较可比周期${directionText} ${Math.abs(round(changeValue, 1))}%。主要驱动为“${mainFactor}”，当前综合置信度为 ${confidence}%。`;
}

function buildTableRows(rows, futureRows, confidence) {
  const historyRows = rows.slice(-4).map((row) => ({
    period: row.date,
    type: '实际',
    typeClass: 'table-actual',
    traffic: formatNumber(row.traffic),
    sales: formatNumber(row.sales),
    detail: row.promo ? '含促销' : '常规'
  }));

  const futureTableRows = futureRows.map((row) => ({
    period: row.dateLabel,
    type: '预测',
    typeClass: 'table-forecast',
    traffic: formatNumber(row.traffic),
    sales: formatNumber(row.sales),
    detail: `${confidence}% 置信度`
  }));

  return historyRows.concat(futureTableRows);
}

function closestPercentage(value, min, max) {
  if (max === min) {
    return 80;
  }
  return clamp(Math.round(((value - min) / (max - min)) * 72 + 28), 20, 100);
}

function buildRecommendations(drivers, scenarioMultiplier, horizon, peak) {
  const trend = drivers.find((item) => item.title === '近期客流趋势') || {};
  const volatility = drivers.find((item) => item.title === '历史波动水平') || {};
  const peakText = peak && peak.date ? formatDateLong(peak.date) : '预测高峰期';
  const recommendations = [{
    title: '按峰值配置现场人力',
    action: `将机动人员优先安排在 ${peakText} 前后，并预留收银与补货支援。`,
    reason: `未来 ${horizon} 天峰值已随星期因子与情景倍率计算，趋势方向为${trend.direction || '中性'}。`,
    priority: '高'
  }];

  if (volatility.direction === '波动') {
    recommendations.push({
      title: '保留弹性库存与班次',
      action: '对高周转商品设置更低补货阈值，晚班保留一名跨岗位人员。',
      reason: `历史波动为 ${volatility.impact || '--'}，均值预测存在偏离风险。`,
      priority: '中'
    });
  }

  if (scenarioMultiplier > 1.05) {
    recommendations.push({
      title: '按活动增量准备物料',
      action: '提前确认赠品、热销 SKU 和高峰收银通道，活动结束后及时回收倍率。',
      reason: `当前情景将基础客流放大至 ${round(scenarioMultiplier, 2)} 倍。`,
      priority: '中'
    });
  }

  return recommendations.slice(0, 3);
}

function calculateForecast(rows, options) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('至少需要 3 行有效数据');
  }

  const settings = options || {};
  const horizon = clamp(Number(settings.horizon) || 1, 1, 7);
  const scenarioMultiplier = clamp(Number(settings.scenarioMultiplier) || 1, 0.7, 1.5);
  const recentRows = rows.slice(-14);
  const trafficValues = recentRows.map((row) => row.traffic);
  const regression = linearRegression(trafficValues);
  const weighted = weightedAverage(trafficValues);
  const lastValue = trafficValues[trafficValues.length - 1];
  const average = mean(trafficValues);
  const deviation = standardDeviation(trafficValues);
  const volatility = average ? (deviation / average) * 100 : 0;
  const weekdayFactors = buildWeekdayFactors(recentRows);
  const lastDate = parseDate(recentRows[recentRows.length - 1].date);
  const recentTicket = weightedAverage(recentRows.map((row) => row.sales / Math.max(row.traffic, 1)));
  const promoFrequency = recentRows.filter((row) => row.promo).length / recentRows.length;
  const futureRows = [];

  for (let index = 1; index <= horizon; index += 1) {
    const trendValue = regression.intercept + regression.slope * (trafficValues.length + index - 1);
    const weightedValue = weighted + (trendValue - weighted) * 0.6;
    let traffic = weightedValue * 0.5 + trendValue * 0.35 + lastValue * 0.15;
    const futureDate = lastDate ? addDays(lastDate, index) : null;
    const weekdayFactor = futureDate ? weekdayFactors[futureDate.getDay()] : 1;
    traffic = clamp(traffic * weekdayFactor * scenarioMultiplier, average * 0.55, average * 1.55);

    const ticketFactor = 1 + promoFrequency * 0.015 + index * 0.001;
    futureRows.push({
      index,
      date: futureDate,
      label: index === 1 ? '预测日' : `D+${index}`,
      dateLabel: formatDate(futureDate) || `D+${index}`,
      traffic,
      sales: traffic * recentTicket * ticketFactor,
      low: 0,
      high: 0
    });
  }

  const predictedTraffic = futureRows.reduce((total, row) => total + row.traffic, 0);
  const predictedSales = futureRows.reduce((total, row) => total + row.sales, 0);
  const modelComparison = buildModelComparison(rows.length >= 8 ? rows : recentRows);
  const bestMape = modelComparison.length ? modelComparison[0].mape : 9;
  const confidence = Math.round(clamp(
    94 - bestMape * 0.8 - (horizon - 1) * 1.15 - Math.max(volatility - 12, 0) * 0.25,
    58,
    93
  ));
  const intervalRatio = Math.max(1 - confidence / 100, 0.07) * 0.8;

  futureRows.forEach((row) => {
    row.low = row.traffic * (1 - intervalRatio);
    row.high = row.traffic * (1 + intervalRatio);
  });

  const comparableRows = rows.slice(-horizon);
  const comparableTotal = comparableRows.reduce((total, row) => total + row.traffic, 0);
  const changeValue = comparableTotal
    ? ((predictedTraffic - comparableTotal) / comparableTotal) * 100
    : ((predictedTraffic / Math.max(horizon, 1) - average) / Math.max(average, 1)) * 100;
  const peak = futureRows.reduce((selected, row) => row.traffic > selected.traffic ? row : selected, futureRows[0]);
  const drivers = buildDrivers(recentRows, confidence, scenarioMultiplier);
  const rangeLabel = settings.rangeLabel || (horizon === 1 ? '明日' : `未来 ${horizon} 天`);
  const dataQuality = buildDataQuality(rows);
  const lastTraffic = trafficValues[trafficValues.length - 1];
  const firstTraffic = trafficValues[0];
  const futureMinimum = Math.min.apply(null, futureRows.map((item) => item.traffic));
  const futureMaximum = Math.max.apply(null, futureRows.map((item) => item.traffic));

  return {
    rangeLabel,
    forecastDateLabel: futureRows[futureRows.length - 1].dateLabel,
    predictedTraffic: formatNumber(predictedTraffic),
    predictedTrafficValue: Math.round(predictedTraffic),
    predictedSales: formatNumber(predictedSales),
    predictedSalesValue: Math.round(predictedSales),
    confidence,
    changeText: `较可比周期 ${formatPercent(changeValue)}`,
    changeValue: round(changeValue, 1),
    peakLabel: peak.date ? formatDateLong(peak.date) : peak.dateLabel,
    peakTraffic: formatNumber(peak.traffic),
    averageTraffic: formatNumber(average),
    lastTraffic: formatNumber(lastTraffic),
    historyChange: formatPercent(((lastTraffic - firstTraffic) / Math.max(firstTraffic, 1)) * 100),
    volatility: `${round(volatility, 1)}%`,
    scenarioMultiplier: round(scenarioMultiplier, 2),
    rangeDays: horizon,
    bars: futureRows.map((row) => ({
      label: row.dateLabel,
      value: closestPercentage(row.traffic, futureMinimum, futureMaximum),
      trafficText: formatNumber(row.traffic)
    })),
    trendPoints: buildTrendPoints(recentRows, futureRows),
    distribution: buildDistribution(recentRows),
    drivers,
    recommendations: buildRecommendations(drivers, scenarioMultiplier, horizon, peak),
    reasonSummary: buildReasonSummary(
      horizon,
      predictedTraffic,
      predictedSales,
      changeValue,
      confidence,
      drivers
    ),
    method: '0.50×加权移动平均 + 0.35×线性趋势 + 0.15×最近值',
    modelComparison,
    bestMape: `${round(bestMape, 1)}%`,
    dataQuality,
    tableRows: buildTableRows(rows, futureRows, confidence),
    futureRows: futureRows.map((row) => ({
      dateLabel: row.dateLabel,
      traffic: formatNumber(row.traffic),
      sales: formatNumber(row.sales),
      low: formatNumber(row.low),
      high: formatNumber(row.high)
    })),
    sourceMeta: settings.sourceMeta || {
      sourceType: '内置示例',
      rawCount: rows.length,
      validCount: rows.length,
      invalidCount: 0
    },
    analysisText: `${rangeLabel}预测使用可解释统计模型。样本期内客流由 ${formatNumber(firstTraffic)} 变化至 ${formatNumber(lastTraffic)} 人次，历史波动 ${round(volatility, 1)}%。模型按趋势、近期权重和星期因子计算，未来 ${horizon} 天预计活跃客流集中在 ${peak.date ? formatDateLong(peak.date) : peak.dateLabel}。`
  };
}

module.exports = {
  DEFAULT_DISTRIBUTION,
  parseImportText,
  rowsToCsv,
  calculateForecast
};
