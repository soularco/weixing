const operations = require('../../services/operations');
const forecastEngine = require('../../utils/forecast-engine');

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
    importText: '',
    importSummary: '内置 28 天样板数据',
    importMessage: '',
    modelMode: 'builtin',
    apiUrl: '',
    apiKey: '',
    modelName: '',
    scenarioMultiplier: 1,
    scenarioText: '1.00x',
    customStatus: '',
    customAnalysis: '',
    customError: ''
  },

  onLoad() {
    const settings = getStoredSettings();
    this.setData({
      modelMode: settings.modelMode || 'builtin',
      apiUrl: settings.apiUrl || '',
      modelName: settings.modelName || ''
    });

    operations.getForecastHistory().then((payload) => {
      this.sourceRows = payload.rows;
      this.sourceMeta = payload.meta;
      this.setData({
        loading: false,
        importSummary: `${payload.meta.validCount} 天样例数据可用`,
        importText: ''
      }, () => {
        this.recalculateForecast('tomorrow');
      });
    }).catch(() => {
      this.setData({
        loading: false,
        importMessage: '示例数据载入失败，请重新编译小程序。'
      });
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
        scenarioMultiplier: this.data.scenarioMultiplier
      });
      this.setData({
        calculating: false,
        forecast: this.decorateForecast(forecast)
      }, () => {
        this.renderCharts();
      });
    } catch (error) {
      this.setData({
        calculating: false,
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
      qualityGrade: qualityScore >= 90 ? '优秀' : qualityScore >= 80 ? '良好' : '可用',
      modelComparison: (forecast.modelComparison || []).map((model, index) => ({
        ...model,
        rank: index + 1
      }))
    };
  },

  handleImportInput(event) {
    this.setData({
      importText: event.detail.value,
      importMessage: ''
    });
  },

  loadSampleToEditor() {
    this.setData({
      importText: forecastEngine.rowsToCsv(this.sourceRows || []),
      importMessage: '样例已放入输入框，可编辑后重新计算。'
    });
  },

  clearImportEditor() {
    this.setData({
      importText: '',
      importMessage: ''
    });
  },

  restoreSampleData() {
    operations.getForecastHistory().then((payload) => {
      this.sourceRows = payload.rows;
      this.sourceMeta = payload.meta;
      this.setData({
        importText: '',
        importSummary: `${payload.meta.validCount} 天样例数据可用`,
        importMessage: '已恢复内置样例。'
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
            this.importTextData(fileResult.data, 'message-file');
          },
          fail: () => {
            this.setData({ importMessage: '文件读取失败，请确认文件为 UTF-8 编码。' });
          }
        });
      }
    });
  },

  importTextData(text, sourceType) {
    try {
      const parsed = forecastEngine.parseImportText(text);
      this.sourceRows = parsed.rows;
      this.sourceMeta = {
        ...parsed.meta,
        sourceType: sourceType === 'message-file' ? '文件导入' : '粘贴导入'
      };
      this.setData({
        importSummary: `有效 ${parsed.meta.validCount} 行，剔除 ${parsed.meta.invalidCount} 行`,
        importMessage: '数据已通过格式校验，正在使用本地模型计算。',
        importText: String(text || '')
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
      this.drawTrendChart(this.data.forecast.trendPoints || []);
      this.drawDistributionChart(this.data.forecast.distribution || []);
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

  drawTrendChart(points) {
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

        const label = `${point.label} ${Math.round(value)}`;
        const textWidth = context.measureText(label).width + 10;
        const labelX = Math.min(Math.max(x - textWidth / 2, plot.left), plot.right - textWidth);
        const labelY = Math.max(y - 28, 4);
        context.fillStyle = 'rgba(255, 255, 255, 0.94)';
        context.fillRect(labelX, labelY, textWidth, 18);
        context.strokeStyle = '#cfdbd7';
        context.lineWidth = 1;
        context.strokeRect(labelX, labelY, textWidth, 18);
        context.beginPath();
        context.moveTo(x, y - 5);
        context.lineTo(x, labelY + 18);
        context.strokeStyle = index === peakIndex ? '#d97706' : '#0b6b4f';
        context.stroke();
        context.fillStyle = '#33433e';
        context.textAlign = 'center';
        context.fillText(label, labelX + textWidth / 2, labelY + 9);
      });
    });
  },

  drawDistributionChart(distribution) {
    if (!distribution.length) {
      return;
    }

    this.prepareCanvas('#distributionCanvas', (context, width, height) => {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.34;
      let startAngle = -Math.PI / 2;

      context.clearRect(0, 0, width, height);
      context.lineWidth = Math.max(14, radius * 0.34);
      context.lineCap = 'butt';

      distribution.forEach((item) => {
        const angle = (Number(item.value) / 100) * Math.PI * 2;
        context.beginPath();
        context.arc(centerX, centerY, radius, startAngle, startAngle + angle);
        context.strokeStyle = item.color;
        context.stroke();
        startAngle += angle;
      });

      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.lineWidth = 1;
      context.strokeStyle = '#edf2f0';
      context.stroke();

      context.fillStyle = '#17212b';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '700 18px sans-serif';
      context.fillText('100%', centerX, centerY - 7);
      context.fillStyle = '#7b8b87';
      context.font = '10px sans-serif';
      context.fillText('来源构成', centerX, centerY + 15);
    });
  }
});
