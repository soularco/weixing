const operations = require('../../services/operations');
const forecastEngine = require('../../utils/forecast-engine');
const forecastStore = require('../../utils/forecast-store');

const RANGE_CONFIG = {
  tomorrow: { horizon: 1, label: '明日' },
  threeDays: { horizon: 3, label: '未来 3 天' },
  week: { horizon: 7, label: '未来 7 天' }
};

const STRENGTH_PERCENT = {
  高: 100,
  中: 66,
  低: 34
};

function getStoredSettings() {
  try {
    return wx.getStorageSync('forecastModelSettings') || {};
  } catch (error) {
    return {};
  }
}

function getPixelRatio() {
  try {
    if (wx.getWindowInfo) {
      return wx.getWindowInfo().pixelRatio || 1;
    }
    return wx.getSystemInfoSync().pixelRatio || 1;
  } catch (error) {
    return 1;
  }
}

function getTouchPoint(event) {
  const source = event && event.touches && event.touches.length
    ? event.touches
    : event && event.changedTouches ? event.changedTouches : [];
  const touch = source[0] || (event && event.detail ? event.detail : event);
  if (!touch) {
    return null;
  }
  const x = Number(touch.x !== undefined ? touch.x : touch.clientX);
  const y = Number(touch.y !== undefined ? touch.y : touch.clientY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function buildTrendFocus(point) {
  if (!point) {
    return null;
  }
  const actual = Number.isFinite(point.actualValue) ? `${point.actualValue}` : '--';
  const forecast = Number.isFinite(point.forecastValue) ? `${point.forecastValue}` : '--';
  const interval = Number.isFinite(point.lowValue) && Number.isFinite(point.highValue)
    ? `${point.lowValue} ~ ${point.highValue}`
    : '--';
  return {
    label: point.label,
    actual,
    forecast,
    interval,
    status: Number.isFinite(point.actualValue) ? '实际客流' : '预测客流'
  };
}

function buildDistributionFocus(item, index) {
  if (!item) {
    return null;
  }
  return {
    index,
    label: item.label,
    value: item.value,
    color: item.color
  };
}

Page({
  data: {
    loading: true,
    calculating: false,
    range: 'tomorrow',
    rangeOptions: [
      { label: '明天', value: 'tomorrow' },
      { label: '未来 3 天', value: 'threeDays' },
      { label: '未来 7 天', value: 'week' }
    ],
    rangeLabel: '明日',
    forecast: null,
    dataExpanded: true,
    summaryExpanded: false,
    driversExpanded: false,
    modelExpanded: false,
    tomorrowExpanded: true,
    algorithm: 'ensemble',
    algorithmLabel: '集成统计模型',
    algorithmOptions: [
      { label: '集成统计', value: 'ensemble' },
      { label: '指数平滑', value: 'exponential' },
      { label: 'Holt-Winters', value: 'holtWinters' }
    ],
    storeContext: null,
    storeContextSummary: '未选择门店，使用基础预测',
    externalFactors: {
      weather: '晴',
      holiday: false,
      promotion: false,
      localEvent: false
    },
    weatherOptions: ['晴', '多云', '阴', '小雨', '中雨', '大雨', '高温', '雪'],
    forecastRuns: [],
    errorStats: null,
    importText: '',
    importSummary: '内置 28 天样板数据',
    importMessage: '',
    importMode: 'text',
    importModes: [
      { label: '文本粘贴', value: 'text' },
      { label: '选择文件', value: 'file' }
    ],
    importDraftStats: { rows: 0, columns: 0, status: '等待输入' },
    importSourceLabel: '本机数据',
    modelMode: 'builtin',
    apiUrl: '',
    apiKey: '',
    modelName: '',
    scenarioMultiplier: 1,
    scenarioText: '1.00x',
    customStatus: '',
    customAnalysis: '',
    customError: '',
    trendActiveIndex: -1,
    trendFocus: null,
    distributionActiveIndex: -1,
    distributionFocus: null,
    barActiveIndex: 0,
    barFocus: null
  },

  onLoad() {
    const settings = getStoredSettings();
    this.setData({
      modelMode: settings.modelMode || 'builtin',
      apiUrl: settings.apiUrl || '',
      modelName: settings.modelName || ''
    });

    const saved = forecastStore.getSourceSnapshot();
    const sourcePromise = saved && saved.rows.length
      ? Promise.resolve(saved)
      : operations.getForecastHistory();

    sourcePromise.then((payload) => {
      this.sourceRows = payload.rows;
      this.sourceMeta = saved && saved.meta ? saved.meta : payload.meta;
      const runs = forecastStore.getForecastRuns(this.sourceRows);
      const errorStats = forecastStore.getErrorStats(runs);
      const context = forecastStore.getStoreContext();
      this.setData({
        importSummary: `${this.sourceMeta.validCount} 天${saved ? '本机保存' : '样例'}数据可用`,
        importText: '',
        importSourceLabel: saved ? '本机保存数据' : '内置样例数据',
        importDraftStats: this.getImportDraftStats(''),
        storeContext: context,
        storeContextSummary: context && context.store ? `${context.store.name} · ${context.competitionLevel}竞争` : '未选择门店，使用基础预测',
        forecastRuns: runs.slice(0, 4),
        errorStats
      }, () => {
        this.recalculateForecast(this.data.range);
      });
    }).catch(() => {
      this.setData({
        loading: false,
        importMessage: '样例数据载入失败，请重新编译小程序。'
      });
    });
  },

  onShow() {
    const context = forecastStore.getStoreContext();
    const runs = forecastStore.getForecastRuns(this.sourceRows || []);
    this.setData({
      storeContext: context,
      storeContextSummary: context && context.store ? `${context.store.name} · ${context.competitionLevel}竞争` : '未选择门店，使用基础预测',
      forecastRuns: runs.slice(0, 4),
      errorStats: forecastStore.getErrorStats(runs)
    }, () => {
      if (this.sourceRows && this.data.forecast) {
        this.recalculateForecast(this.data.range);
      }
    });
  },

  onReady() {
    this.canvasReady = true;
    this.renderCharts();
  },

  selectRange(event) {
    const range = event.currentTarget.dataset.range;
    if (range && range !== this.data.range) {
      this.recalculateForecast(range);
    }
  },

  togglePanel(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || !Object.prototype.hasOwnProperty.call(this.data, key)) {
      return;
    }
    const updates = {};
    updates[key] = !this.data[key];
    this.setData(updates, () => {
      if (key === 'summaryExpanded') {
        this.renderCharts();
      }
    });
  },

  focusBar(event) {
    const index = Number(event.currentTarget.dataset.index);
    const bars = this.data.forecast && this.data.forecast.bars ? this.data.forecast.bars : [];
    if (!Number.isInteger(index) || index < 0 || index >= bars.length) {
      return;
    }
    this.setData({
      barActiveIndex: index,
      barFocus: bars[index]
    });
  },

  handleTrendTouch(event) {
    const touch = getTouchPoint(event);
    const layout = this.trendLayout;
    const points = this.data.forecast && this.data.forecast.trendPoints ? this.data.forecast.trendPoints : [];
    if (!touch || !layout || !points.length) {
      return;
    }
    const ratio = (touch.x - layout.plot.left) / Math.max(layout.plot.right - layout.plot.left, 1);
    const index = Math.min(Math.max(Math.round(ratio * Math.max(points.length - 1, 0)), 0), points.length - 1);
    if (index === this.data.trendActiveIndex) {
      return;
    }
    this.setData({
      trendActiveIndex: index,
      trendFocus: buildTrendFocus(points[index])
    }, () => {
      this.drawTrendChart(points, index);
    });
  },

  handleTrendTouchEnd() {},

  handleDistributionTouch(event) {
    const touch = getTouchPoint(event);
    const layout = this.distributionLayout;
    const distribution = this.data.forecast && this.data.forecast.distribution ? this.data.forecast.distribution : [];
    if (!touch || !layout || !distribution.length) {
      return;
    }
    const deltaX = touch.x - layout.centerX;
    const deltaY = touch.y - layout.centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (Math.abs(distance - layout.radius) > layout.thickness * 0.78) {
      return;
    }
    const startAngle = -Math.PI / 2;
    const angle = Math.atan2(deltaY, deltaX);
    const normalized = (angle - startAngle + Math.PI * 2) % (Math.PI * 2);
    const target = normalized / (Math.PI * 2);
    let cumulative = 0;
    let index = distribution.length - 1;
    for (let itemIndex = 0; itemIndex < distribution.length; itemIndex += 1) {
      cumulative += Number(distribution[itemIndex].value) / 100;
      if (target <= cumulative) {
        index = itemIndex;
        break;
      }
    }
    if (index === this.data.distributionActiveIndex) {
      return;
    }
    this.setData({
      distributionActiveIndex: index,
      distributionFocus: buildDistributionFocus(distribution[index], index)
    }, () => {
      this.drawDistributionChart(distribution, index);
    });
  },

  handleDistributionTouchEnd() {},

  focusDistributionSegment(event) {
    const index = Number(event.currentTarget.dataset.index);
    const distribution = this.data.forecast && this.data.forecast.distribution ? this.data.forecast.distribution : [];
    if (!Number.isInteger(index) || index < 0 || index >= distribution.length) {
      return;
    }
    this.setData({
      distributionActiveIndex: index,
      distributionFocus: buildDistributionFocus(distribution[index], index)
    }, () => {
      this.drawDistributionChart(distribution, index);
    });
  },

  recalculateForecast(range) {
    if (!this.sourceRows || !this.sourceRows.length) {
      return;
    }

    const selectedRange = range || this.data.range;
    const config = RANGE_CONFIG[selectedRange] || RANGE_CONFIG.tomorrow;
    this.setData({
      calculating: true,
      range: selectedRange,
      rangeLabel: config.label
    });

    try {
      const forecast = forecastEngine.calculateForecast(this.sourceRows, {
        horizon: config.horizon,
        rangeLabel: config.label,
        sourceMeta: this.sourceMeta,
        scenarioMultiplier: this.data.scenarioMultiplier,
        range: selectedRange,
        algorithm: this.data.algorithm,
        storeContext: this.data.storeContext,
        externalFactors: this.data.externalFactors
      });
      const nextForecast = this.decorateForecast(forecast);
      const barIndex = nextForecast.bars && nextForecast.bars.length ? 0 : -1;
      const barFocus = barIndex >= 0 ? nextForecast.bars[barIndex] : null;
      this.setData({
        calculating: false,
        forecast: nextForecast,
        loading: false,
        trendActiveIndex: -1,
        trendFocus: null,
        distributionActiveIndex: -1,
        distributionFocus: null,
        barActiveIndex: barIndex,
        barFocus
      }, () => {
        forecastStore.saveForecastOutputs(forecast, this.data.storeContext);
        forecastStore.recordPredictionRun(forecast);
        const runs = forecastStore.getForecastRuns(this.sourceRows || []);
        this.setData({
          forecastRuns: runs.slice(0, 4),
          errorStats: forecastStore.getErrorStats(runs),
          algorithmLabel: forecast.algorithmLabel || this.data.algorithmLabel
        });
        this.renderCharts();
      });
    } catch (error) {
      this.setData({
        calculating: false,
        loading: false,
        importMessage: error.message || '预测计算失败，请检查数据。'
      });
    }
  },

  decorateForecast(forecast) {
    const drivers = (forecast.drivers || []).map((driver) => ({
      ...driver,
      strengthPercent: STRENGTH_PERCENT[driver.strength] || 50,
      strengthClass: driver.strength === '高' ? 'strength-high' : driver.strength === '中' ? 'strength-medium' : 'strength-low'
    }));
    const qualityScore = forecast.dataQuality ? forecast.dataQuality.score : 0;

    return {
      ...forecast,
      drivers,
      topDrivers: drivers.slice(0, 2),
      factorBreakdown: (forecast.factorBreakdown || []).map((item) => ({
        ...item,
        strengthClass: item.strength === '高' ? 'strength-high' : item.strength === '中' ? 'strength-medium' : 'strength-low'
      })),
      qualityGrade: qualityScore >= 90 ? '优秀' : qualityScore >= 80 ? '良好' : '可用',
      modelComparison: (forecast.modelComparison || []).map((model, index) => ({
        ...model,
        rank: index + 1
      }))
    };
  },

  getImportDraftStats(text) {
    const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
    const header = lines[0] || '';
    const delimiter = header.indexOf('\t') >= 0 ? '\t' : header.indexOf(';') >= 0 ? ';' : ',';
    const columns = header ? header.split(delimiter).filter((item) => item.trim()).length : 0;
    const rows = Math.max(lines.length - 1, 0);
    let status = '等待输入';
    if (lines.length) {
      if (rows < 1) {
        status = '需要表头与数据行';
      } else if (columns < 3) {
        status = '至少需要日期、客流、销售额';
      } else if (rows < 3) {
        status = '结构正常，至少还需 3 行';
      } else {
        status = '结构可导入';
      }
    }
    return { rows, columns, status };
  },

  handleImportInput(event) {
    this.setData({
      importText: event.detail.value,
      importMessage: '',
      importDraftStats: this.getImportDraftStats(event.detail.value)
    });
  },

  loadSampleToEditor() {
    const sample = forecastEngine.rowsToCsv(this.sourceRows || []);
    this.setData({
      importMode: 'text',
      importText: sample,
      importDraftStats: this.getImportDraftStats(sample),
      importSourceLabel: '样例数据已载入编辑框',
      importMessage: '样例已放入输入框，可编辑后重新计算。'
    });
  },

  copyImportTemplate() {
    const rows = (this.sourceRows || []).slice(0, 3);
    const template = rows.length ? forecastEngine.rowsToCsv(rows) : 'date,traffic,sales,staff,stock,members,miniProgram,referral,promo,weather,holiday,localEvent\n2026-09-01,742,48600,7,168,176,118,62,0,晴,0,0';
    wx.setClipboardData({
      data: template,
      success: () => {
        this.setData({ importMessage: '数据模板已复制，可直接粘贴到表格或输入框。' });
      }
    });
  },

  selectImportMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === 'file' || mode === 'text') {
      this.setData({ importMode: mode, importMessage: '' });
    }
  },

  clearImportEditor() {
    this.setData({
      importText: '',
      importMessage: '',
      importDraftStats: this.getImportDraftStats('')
    });
  },

  restoreSampleData() {
    operations.getForecastHistory().then((payload) => {
      this.sourceRows = payload.rows;
      this.sourceMeta = payload.meta;
      forecastStore.saveSourceSnapshot(this.sourceRows, this.sourceMeta);
      this.setData({
        importText: '',
        importSummary: `${payload.meta.validCount} 天样例数据可用`,
        importMessage: '已恢复内置样例。',
        importSourceLabel: '内置样例数据',
        importDraftStats: this.getImportDraftStats('')
      }, () => {
        this.recalculateForecast(this.data.range);
      });
    });
  },

  chooseDataFile() {
    if (!wx.chooseMessageFile) {
      wx.showToast({ title: '当前环境不支持选择文件', icon: 'none' });
      return;
    }

    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv', 'json', 'txt'],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file || !file.path) {
          return;
        }
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'utf8',
          success: (fileResult) => {
            this.importTextData(fileResult.data, 'message-file', file.name || '已选择文件');
          },
          fail: () => {
            this.setData({ importMessage: '文件读取失败，请确认文件为 UTF-8 编码。' });
          }
        });
      }
    });
  },

  importTextData(text, sourceType, fileName) {
    try {
      const parsed = forecastEngine.parseImportText(text);
      this.sourceRows = parsed.rows;
      this.sourceMeta = {
        ...parsed.meta,
        sourceType: sourceType === 'message-file' ? '文件导入' : '粘贴导入'
      };
      forecastStore.saveSourceSnapshot(this.sourceRows, this.sourceMeta);
      this.setData({
        importSummary: `有效 ${parsed.meta.validCount} 行，剔除 ${parsed.meta.invalidCount} 行`,
        importMessage: '数据已通过格式校验，正在使用本地模型计算。',
        importText: String(text || ''),
        importDraftStats: this.getImportDraftStats(text),
        importSourceLabel: fileName || (sourceType === 'message-file' ? '已选择文件' : '文本框输入')
      }, () => {
        this.recalculateForecast(this.data.range);
        wx.showToast({ title: '导入并计算完成', icon: 'success' });
      });
    } catch (error) {
      this.setData({
        importMessage: error.message || '导入失败，请检查 CSV 或 JSON 格式。'
      });
    }
  },

  importFromEditor() {
    this.importTextData(this.data.importText, 'editor');
  },

  selectModelMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode !== 'builtin' && mode !== 'custom') {
      return;
    }
    this.setData({
      modelMode: mode,
      customError: '',
      customStatus: mode === 'builtin' ? '当前使用本地免费模型' : ''
    });
  },

  handleApiUrlInput(event) {
    this.setData({ apiUrl: event.detail.value });
  },

  handleApiKeyInput(event) {
    this.setData({ apiKey: event.detail.value });
  },

  handleModelNameInput(event) {
    this.setData({ modelName: event.detail.value });
  },

  handleScenarioChange(event) {
    const multiplier = Number(event.detail.value) || 1;
    this.setData({
      scenarioMultiplier: multiplier,
      scenarioText: `${multiplier.toFixed(2)}x`
    }, () => {
      this.recalculateForecast(this.data.range);
    });
  },

  selectAlgorithm(event) {
    const algorithm = event.currentTarget.dataset.algorithm;
    const option = this.data.algorithmOptions.find((item) => item.value === algorithm);
    if (!option) {
      return;
    }
    this.setData({
      algorithm,
      algorithmLabel: option.label
    }, () => {
      this.recalculateForecast(this.data.range);
    });
  },

  selectWeather(event) {
    const weather = event.detail.value;
    this.setData({
      externalFactors: {
        ...this.data.externalFactors,
        weather
      }
    }, () => {
      this.recalculateForecast(this.data.range);
    });
  },

  toggleExternalFactor(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || !Object.prototype.hasOwnProperty.call(this.data.externalFactors, key)) {
      return;
    }
    const externalFactors = {
      ...this.data.externalFactors,
      [key]: !this.data.externalFactors[key]
    };
    this.setData({ externalFactors }, () => {
      this.recalculateForecast(this.data.range);
    });
  },

  openStorePage() {
    wx.switchTab({ url: '/pages/store/index' });
  },

  saveModelSettings() {
    const settings = {
      modelMode: this.data.modelMode,
      apiUrl: this.data.apiUrl.trim(),
      modelName: this.data.modelName.trim()
    };
    try {
      wx.setStorageSync('forecastModelSettings', settings);
      this.setData({ customStatus: '模型设置已保存在本机，API Key 未保存。' });
      wx.showToast({ title: '设置已保存', icon: 'success' });
    } catch (error) {
      this.setData({ customStatus: '本机存储失败，本次运行仍可使用。' });
    }
  },

  runCustomAnalysis() {
    const apiUrl = this.data.apiUrl.trim();
    const modelName = this.data.modelName.trim();
    const apiKey = this.data.apiKey.trim();

    if (!apiUrl || !modelName) {
      this.setData({ customError: '请先填写接口地址和模型名称。' });
      return;
    }

    const forecast = this.data.forecast;
    const driverSummary = (forecast.drivers || [])
      .map((item) => `${item.title}：${item.impact}，${item.reason}`)
      .join('\n');
    const payload = {
      model: modelName,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是门店经营分析师。请基于给定预测，使用简洁中文说明关键原因，并给出三条可执行建议。'
        },
        {
          role: 'user',
          content: `预测范围：${forecast.rangeLabel}\n预测客流：${forecast.predictedTraffic} 人次\n预测销售额：${forecast.predictedSales} 元\n置信度：${forecast.confidence}%\n方法：${forecast.method}\n影响因素：\n${driverSummary}`
        }
      ]
    };
    const header = { 'content-type': 'application/json' };
    if (apiKey) {
      header.Authorization = `Bearer ${apiKey}`;
    }

    this.setData({
      customStatus: '正在请求自定义模型...',
      customError: '',
      customAnalysis: ''
    });

    wx.request({
      url: apiUrl,
      method: 'POST',
      header,
      data: payload,
      timeout: 20000,
      success: (response) => {
        const content = this.extractModelContent(response.data);
        if (!content) {
          this.setData({
            customStatus: '',
            customError: '接口返回成功，但未识别到文本结果。'
          });
          return;
        }
        this.setData({
          customStatus: `由 ${modelName} 生成`,
          customAnalysis: content
        });
      },
      fail: (error) => {
        this.setData({
          customStatus: '',
          customError: error.errMsg || '接口请求失败，请检查域名白名单与接口格式。'
        });
      }
    });
  },

  extractModelContent(payload) {
    if (!payload) {
      return '';
    }
    if (typeof payload === 'string') {
      return payload;
    }
    if (payload.choices && payload.choices[0]) {
      const choice = payload.choices[0];
      if (choice.message && choice.message.content) {
        return typeof choice.message.content === 'string'
          ? choice.message.content
          : JSON.stringify(choice.message.content);
      }
      if (choice.text) {
        return choice.text;
      }
    }
    return payload.result || payload.analysis || payload.message || '';
  },

  renderCharts() {
    if (!this.canvasReady || !this.data.forecast) {
      return;
    }
    wx.nextTick(() => {
      this.drawTrendChart(this.data.forecast.trendPoints || [], this.data.trendActiveIndex);
      this.drawDistributionChart(this.data.forecast.distribution || [], this.data.distributionActiveIndex);
    });
  },

  prepareCanvas(selector, drawCallback) {
    this.createSelectorQuery()
      .select(selector)
      .fields({ node: true, size: true })
      .exec((result) => {
        const target = result && result[0];
        if (!target || !target.node) {
          return;
        }
        const canvas = target.node;
        const context = canvas.getContext('2d');
        const ratio = getPixelRatio();
        canvas.width = target.width * ratio;
        canvas.height = target.height * ratio;
        context.scale(ratio, ratio);
        drawCallback(context, target.width, target.height);
      });
  },

  drawTrendChart(points, activeIndex) {
    if (!points.length) {
      return;
    }

    this.prepareCanvas('#trendCanvas', (context, width, height) => {
      const values = [];
      points.forEach((point) => {
        ['actual', 'forecast', 'low', 'high'].forEach((key) => {
          if (Number.isFinite(point[key])) {
            values.push(point[key]);
          }
        });
      });

      let minimum = Math.min.apply(null, values);
      let maximum = Math.max.apply(null, values);
      const padding = Math.max((maximum - minimum) * 0.18, maximum * 0.04, 10);
      minimum = Math.max(0, minimum - padding);
      maximum += padding;

      const plot = {
        left: 42,
        right: width - 12,
        top: 30,
        bottom: height - 30
      };
      const mapX = (index) => plot.left + (index / Math.max(points.length - 1, 1)) * (plot.right - plot.left);
      const mapY = (value) => plot.bottom - ((value - minimum) / Math.max(maximum - minimum, 1)) * (plot.bottom - plot.top);
      const selectedIndex = Number.isInteger(activeIndex) ? Math.min(Math.max(activeIndex, -1), points.length - 1) : -1;
      this.trendLayout = { plot, points };

      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;
      context.font = '10px sans-serif';
      context.textBaseline = 'middle';

      for (let index = 0; index <= 4; index += 1) {
        const y = plot.top + (index / 4) * (plot.bottom - plot.top);
        const value = maximum - (index / 4) * (maximum - minimum);
        context.beginPath();
        context.setLineDash([3, 4]);
        context.strokeStyle = '#d9e5e1';
        context.moveTo(plot.left, y);
        context.lineTo(plot.right, y);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = '#7b8b87';
        context.fillText(Math.round(value).toString(), 4, y);
      }

      points.forEach((point, index) => {
        if (index % 2 !== 0 && index !== points.length - 1) {
          return;
        }
        const x = mapX(index);
        context.beginPath();
        context.setLineDash([]);
        context.strokeStyle = '#edf2f0';
        context.moveTo(x, plot.top);
        context.lineTo(x, plot.bottom);
        context.stroke();
        context.fillStyle = '#778580';
        context.textAlign = 'center';
        context.fillText(point.label || '', x, height - 14);
      });

      const intervalPoints = points
        .map((point, index) => ({ point, index }))
        .filter((item) => Number.isFinite(item.point.low) && Number.isFinite(item.point.high));

      if (intervalPoints.length) {
        context.beginPath();
        intervalPoints.forEach((item, index) => {
          const x = mapX(item.index);
          const y = mapY(item.point.high);
          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        });
        intervalPoints.slice().reverse().forEach((item) => {
          context.lineTo(mapX(item.index), mapY(item.point.low));
        });
        context.closePath();
        context.fillStyle = 'rgba(217, 119, 6, 0.10)';
        context.fill();

        [['low', '#dda15e'], ['high', '#dda15e']].forEach((line) => {
          context.beginPath();
          context.setLineDash([2, 4]);
          context.strokeStyle = line[1];
          context.lineWidth = 1;
          intervalPoints.forEach((item, index) => {
            const x = mapX(item.index);
            const y = mapY(item.point[line[0]]);
            if (index === 0) {
              context.moveTo(x, y);
            } else {
              context.lineTo(x, y);
            }
          });
          context.stroke();
        });
      }

      context.setLineDash([]);
      context.beginPath();
      context.lineWidth = 2.4;
      context.strokeStyle = '#0b6b4f';
      context.lineJoin = 'round';
      let actualStarted = false;
      points.forEach((point, index) => {
        if (!Number.isFinite(point.actual)) {
          return;
        }
        const x = mapX(index);
        const y = mapY(point.actual);
        if (!actualStarted) {
          context.moveTo(x, y);
          actualStarted = true;
        } else {
          context.lineTo(x, y);
        }
      });
      context.stroke();

      context.beginPath();
      context.setLineDash([7, 5]);
      context.lineWidth = 2.4;
      context.strokeStyle = '#d97706';
      let forecastStarted = false;
      const lastActualIndex = points.reduce((selected, point, index) => Number.isFinite(point.actual) ? index : selected, -1);
      points.forEach((point, index) => {
        const value = Number.isFinite(point.forecast) ? point.forecast : (index === lastActualIndex ? point.actual : null);
        if (!Number.isFinite(value)) {
          return;
        }
        const x = mapX(index);
        const y = mapY(value);
        if (!forecastStarted) {
          context.moveTo(x, y);
          forecastStarted = true;
        } else {
          context.lineTo(x, y);
        }
      });
      context.stroke();
      context.setLineDash([]);

      if (selectedIndex >= 0) {
        const selectedPoint = points[selectedIndex];
        const selectedX = mapX(selectedIndex);
        const selectedValue = Number.isFinite(selectedPoint.forecast) ? selectedPoint.forecast : selectedPoint.actual;
        const selectedY = mapY(selectedValue);
        context.beginPath();
        context.setLineDash([4, 4]);
        context.strokeStyle = '#9bb8b0';
        context.lineWidth = 1;
        context.moveTo(selectedX, plot.top);
        context.lineTo(selectedX, plot.bottom);
        context.stroke();
        context.setLineDash([]);
        context.beginPath();
        context.arc(selectedX, selectedY, 5.2, 0, Math.PI * 2);
        context.fillStyle = 'rgba(255, 255, 255, 0.98)';
        context.fill();
        context.lineWidth = 2.4;
        context.strokeStyle = Number.isFinite(selectedPoint.forecast) ? '#d97706' : '#0b6b4f';
        context.stroke();
      }

      const markedIndexes = [];
      if (lastActualIndex >= 0) {
        markedIndexes.push(lastActualIndex);
      }
      let peakIndex = -1;
      points.forEach((point, index) => {
        if (Number.isFinite(point.forecast) && (peakIndex < 0 || point.forecast > points[peakIndex].forecast)) {
          peakIndex = index;
        }
      });
      if (peakIndex >= 0 && !markedIndexes.includes(peakIndex)) {
        markedIndexes.push(peakIndex);
      }

      markedIndexes.forEach((index) => {
        const point = points[index];
        const value = Number.isFinite(point.forecast) ? point.forecast : point.actual;
        const x = mapX(index);
        const y = mapY(value);
        context.beginPath();
        context.arc(x, y, 3.4, 0, Math.PI * 2);
        context.fillStyle = '#ffffff';
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = index === peakIndex ? '#d97706' : '#0b6b4f';
        context.stroke();
      });

      if (selectedIndex >= 0) {
        const selectedPoint = points[selectedIndex];
        const selectedX = mapX(selectedIndex);
        const selectedValue = Number.isFinite(selectedPoint.forecast) ? selectedPoint.forecast : selectedPoint.actual;
        const selectedY = mapY(selectedValue);
        const tooltipLines = [selectedPoint.label || '--'];
        if (Number.isFinite(selectedPoint.actual)) {
          tooltipLines.push(`实际 ${Math.round(selectedPoint.actual)}`);
        }
        if (Number.isFinite(selectedPoint.forecast)) {
          tooltipLines.push(`预测 ${Math.round(selectedPoint.forecast)}`);
        }
        if (Number.isFinite(selectedPoint.low) && Number.isFinite(selectedPoint.high)) {
          tooltipLines.push(`区间 ${Math.round(selectedPoint.low)}~${Math.round(selectedPoint.high)}`);
        }
        context.font = '10px sans-serif';
        const tooltipWidth = Math.max.apply(null, tooltipLines.map((line) => context.measureText(line).width)) + 18;
        const tooltipHeight = 16 + tooltipLines.length * 14;
        const tooltipX = Math.min(Math.max(selectedX - tooltipWidth / 2, plot.left), plot.right - tooltipWidth);
        const tooltipY = Math.max(selectedY - tooltipHeight - 12, 2);
        context.fillStyle = 'rgba(16, 47, 42, 0.96)';
        context.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        context.strokeStyle = 'rgba(183, 225, 210, 0.72)';
        context.lineWidth = 1;
        context.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        context.textAlign = 'left';
        context.fillStyle = '#dff5ed';
        tooltipLines.forEach((line, lineIndex) => {
          context.fillText(line, tooltipX + 9, tooltipY + 11 + lineIndex * 14);
        });
      }
    });
  },

  drawDistributionChart(distribution, activeIndex) {
    if (!distribution.length) {
      return;
    }

    this.prepareCanvas('#distributionCanvas', (context, width, height) => {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.31;
      const thickness = Math.max(20, radius * 0.42);
      const selectedIndex = Number.isInteger(activeIndex) ? Math.min(Math.max(activeIndex, -1), distribution.length - 1) : -1;
      let startAngle = -Math.PI / 2;
      this.distributionLayout = { centerX, centerY, radius, thickness };

      context.clearRect(0, 0, width, height);
      context.lineCap = 'butt';
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.lineWidth = thickness;
      context.strokeStyle = '#edf7f3';
      context.stroke();

      distribution.forEach((item, index) => {
        const angle = (Number(item.value) / 100) * Math.PI * 2;
        const isActive = index === selectedIndex;
        context.beginPath();
        context.arc(centerX, centerY, radius + (isActive ? 4 : 0), startAngle, startAngle + angle);
        context.lineWidth = thickness + (isActive ? 4 : 0);
        context.strokeStyle = item.color;
        context.shadowColor = isActive ? 'rgba(11, 107, 79, 0.26)' : 'rgba(11, 107, 79, 0)';
        context.shadowBlur = isActive ? 10 : 0;
        context.stroke();
        context.shadowBlur = 0;
        startAngle += angle;
      });

      let separatorAngle = -Math.PI / 2;
      distribution.forEach((item) => {
        const innerRadius = radius - thickness / 2 - 1;
        const outerRadius = radius + thickness / 2 + 1;
        context.beginPath();
        context.moveTo(centerX + Math.cos(separatorAngle) * innerRadius, centerY + Math.sin(separatorAngle) * innerRadius);
        context.lineTo(centerX + Math.cos(separatorAngle) * outerRadius, centerY + Math.sin(separatorAngle) * outerRadius);
        context.lineWidth = 2;
        context.strokeStyle = '#ffffff';
        context.stroke();
        separatorAngle += (Number(item.value) / 100) * Math.PI * 2;
      });

      const focus = selectedIndex >= 0 ? distribution[selectedIndex] : null;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = focus ? focus.color : '#17212b';
      context.font = '700 19px sans-serif';
      context.fillText(focus ? `${focus.value}%` : '100%', centerX, centerY - 8);
      context.fillStyle = '#7b8b87';
      context.font = '10px sans-serif';
      context.fillText(focus ? focus.label : '来源构成', centerX, centerY + 15);
    });
  }
});
