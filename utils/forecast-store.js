const STORAGE_KEYS = {
  source: 'forecastSourceSnapshot',
  storeContext: 'forecastStoreContext',
  outputs: 'forecastOutputs',
  latestOutput: 'forecastLatestOutput',
  runs: 'forecastPredictionRuns'
};

const memoryStorage = {};

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function getStorage(key, fallback) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const value = wx.getStorageSync(key);
      return value === '' || value === undefined ? clone(fallback) : value;
    }
  } catch (error) {
    // Fall through to the in-memory store so a storage failure does not block forecasting.
  }
  return Object.prototype.hasOwnProperty.call(memoryStorage, key) ? clone(memoryStorage[key]) : clone(fallback);
}

function setStorage(key, value) {
  const stored = clone(value);
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(key, stored);
      return true;
    }
  } catch (error) {
    // Keep the current session usable even when local storage is unavailable.
  }
  memoryStorage[key] = stored;
  return false;
}

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function saveSourceSnapshot(rows, meta) {
  if (!Array.isArray(rows) || !rows.length) {
    return null;
  }
  const payload = {
    rows: clone(rows),
    meta: clone(meta || {}),
    savedAt: Date.now()
  };
  setStorage(STORAGE_KEYS.source, payload);
  return payload;
}

function getSourceSnapshot() {
  const payload = getStorage(STORAGE_KEYS.source, null);
  return payload && Array.isArray(payload.rows) && payload.rows.length ? payload : null;
}

function saveStoreContext(context) {
  if (!context) {
    return null;
  }
  const payload = clone(context);
  payload.savedAt = Date.now();
  setStorage(STORAGE_KEYS.storeContext, payload);
  return payload;
}

function getStoreContext() {
  return getStorage(STORAGE_KEYS.storeContext, null);
}

function getFirstDayValues(forecast) {
  const firstDay = forecast && Array.isArray(forecast.futureRows) ? forecast.futureRows[0] : null;
  const rangeDays = Math.max(safeNumber(forecast && forecast.rangeDays, 1), 1);
  return {
    traffic: safeNumber(
      firstDay && firstDay.trafficValue,
      safeNumber(forecast && forecast.predictedTrafficFirstDayValue, safeNumber(forecast && forecast.predictedTrafficValue, 0) / rangeDays)
    ),
    sales: safeNumber(
      firstDay && firstDay.salesValue,
      safeNumber(forecast && forecast.predictedSalesFirstDayValue, safeNumber(forecast && forecast.predictedSalesValue, 0) / rangeDays)
    ),
    targetDate: (firstDay && firstDay.date) || (forecast && forecast.forecastTargetDate) || '',
    targetLabel: (firstDay && firstDay.dateLabel) || (forecast && forecast.forecastDateLabel) || ''
  };
}

function getErrorStats(runs) {
  const evaluated = (runs || []).filter((run) => Number.isFinite(run.actualTraffic) && Number.isFinite(run.errorRate));
  if (!evaluated.length) {
    return {
      count: 0,
      mapeText: '--',
      averageErrorText: '--',
      directionText: '暂无回填样本'
    };
  }

  const mape = evaluated.reduce((total, run) => total + Math.abs(run.errorRate), 0) / evaluated.length;
  const averageError = evaluated.reduce((total, run) => total + Math.abs(run.errorValue), 0) / evaluated.length;
  const bias = evaluated.reduce((total, run) => total + run.errorValue, 0) / evaluated.length;
  return {
    count: evaluated.length,
    mapeText: `${mape.toFixed(1)}%`,
    averageErrorText: `${Math.round(averageError)} 人次`,
    directionText: bias > 50 ? '预测偏低' : bias < -50 ? '预测偏高' : '误差均衡'
  };
}

function getForecastRuns(rows) {
  const runs = getStorage(STORAGE_KEYS.runs, []);
  if (!Array.isArray(runs)) {
    return [];
  }

  if (Array.isArray(rows) && rows.length) {
    const rowByDate = rows.reduce((lookup, row) => {
      if (row && row.date) {
        lookup[String(row.date)] = safeNumber(row.traffic, NaN);
      }
      return lookup;
    }, {});
    let changed = false;
    runs.forEach((run) => {
      if (!run.targetDate || Number.isFinite(run.actualTraffic) || !Number.isFinite(rowByDate[run.targetDate])) {
        return;
      }
      run.actualTraffic = rowByDate[run.targetDate];
      run.errorValue = run.actualTraffic - run.predictedTrafficFirstDay;
      run.errorRate = run.predictedTrafficFirstDay
        ? (run.errorValue / run.predictedTrafficFirstDay) * 100
        : 0;
      run.evaluatedAt = Date.now();
      changed = true;
    });
    if (changed) {
      setStorage(STORAGE_KEYS.runs, runs);
    }
  }

  const labels = {
    ensemble: '集成统计模型',
    exponential: '指数平滑',
    holtWinters: '周周期 Holt-Winters'
  };
  return runs
    .map((run) => ({
      ...run,
      algorithmLabel: labels[run.algorithm] || run.algorithm || '统计模型',
      errorRateText: Number.isFinite(run.errorRate) ? `${run.errorRate.toFixed(1)}%` : '待回填'
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
}

function recordPredictionRun(forecast) {
  if (!forecast) {
    return null;
  }
  const firstDay = getFirstDayValues(forecast);
  if (!firstDay.traffic) {
    return null;
  }
  const runs = getForecastRuns();
  const record = {
    id: `run-${Date.now()}`,
    createdAt: Date.now(),
    targetDate: firstDay.targetDate,
    targetLabel: firstDay.targetLabel,
    range: forecast.range || '',
    rangeLabel: forecast.rangeLabel || '明日',
    algorithm: forecast.algorithm || 'ensemble',
    method: forecast.method || '',
    confidence: safeNumber(forecast.confidence, 0),
    predictedTrafficFirstDay: Math.round(firstDay.traffic),
    predictedSalesFirstDay: Math.round(firstDay.sales),
    externalImpact: safeNumber(forecast.externalImpactPercent, 0),
    locationFactor: safeNumber(forecast.storeContext && forecast.storeContext.locationFactor, 1),
    actualTraffic: null,
    errorValue: null,
    errorRate: null
  };
  const nextRuns = [record].concat(runs).slice(0, 20);
  setStorage(STORAGE_KEYS.runs, nextRuns);
  return record;
}

function saveForecastOutputs(forecast, context) {
  if (!forecast) {
    return null;
  }
  const firstDay = getFirstDayValues(forecast);
  const record = {
    range: forecast.range || '',
    rangeLabel: forecast.rangeLabel || '明日',
    forecastDateLabel: forecast.forecastDateLabel || firstDay.targetLabel,
    forecastTargetDate: firstDay.targetDate,
    predictedTrafficFirstDayValue: Math.round(firstDay.traffic),
    predictedSalesFirstDayValue: Math.round(firstDay.sales),
    predictedTrafficTotalValue: safeNumber(forecast.predictedTrafficValue, Math.round(firstDay.traffic * Math.max(forecast.rangeDays || 1, 1))),
    predictedSalesTotalValue: safeNumber(forecast.predictedSalesValue, Math.round(firstDay.sales * Math.max(forecast.rangeDays || 1, 1))),
    confidence: safeNumber(forecast.confidence, 0),
    algorithm: forecast.algorithm || 'ensemble',
    method: forecast.method || '',
    externalImpactPercent: safeNumber(forecast.externalImpactPercent, 0),
    storeContext: forecast.storeContext ? clone(forecast.storeContext) : clone(context || getStoreContext()),
    generatedAt: Date.now()
  };
  const outputs = getStorage(STORAGE_KEYS.outputs, {});
  outputs[record.range || 'tomorrow'] = record;
  setStorage(STORAGE_KEYS.outputs, outputs);
  setStorage(STORAGE_KEYS.latestOutput, record);
  return record;
}

function getForecastOutputs() {
  return getStorage(STORAGE_KEYS.outputs, {});
}

function getLatestForecastOutput() {
  return getStorage(STORAGE_KEYS.latestOutput, null);
}

function clearForecastOutputs() {
  setStorage(STORAGE_KEYS.outputs, {});
  setStorage(STORAGE_KEYS.latestOutput, null);
}

module.exports = {
  STORAGE_KEYS,
  saveSourceSnapshot,
  getSourceSnapshot,
  saveStoreContext,
  getStoreContext,
  saveForecastOutputs,
  getForecastOutputs,
  getLatestForecastOutput,
  recordPredictionRun,
  getForecastRuns,
  getErrorStats,
  clearForecastOutputs
};
