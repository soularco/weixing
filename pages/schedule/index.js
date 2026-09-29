const operations = require('../../services/operations');
const forecastStore = require('../../utils/forecast-store');

Page({
  data: {
    loading: true,
    schedule: null,
    linkedForecast: null,
    generated: false
  },

  onLoad() {
    this.loadSchedule();
  },

  onShow() {
    if (!this.data.loading) {
      this.loadSchedule();
    }
  },

  loadSchedule() {
    this.setData({ loading: true });
    operations.getSchedule().then((schedule) => {
      const linkedForecast = forecastStore.getLatestForecastOutput();
      if (!linkedForecast) {
        this.setData({
          loading: false,
          schedule,
          linkedForecast: null
        });
        return;
      }

      const suggestedPeople = Math.max(3, Math.ceil(linkedForecast.predictedTrafficFirstDayValue / 150));
      const coverage = (schedule.coverage || []).map((item) => {
        if (item.label === '建议人数') {
          return { ...item, value: `${suggestedPeople} 人` };
        }
        if (item.label === '人力成本') {
          return { ...item, value: `${(suggestedPeople * 360).toLocaleString()} 元` };
        }
        return item;
      });
      const shifts = (schedule.shifts || []).map((shift) => (
        shift.id === 'evening' && suggestedPeople >= 8
          ? { ...shift, people: shift.people + 1, focus: `${shift.focus}，增加 1 名高峰机动` }
          : shift
      ));

      this.setData({
        loading: false,
        linkedForecast,
        schedule: {
          ...schedule,
          coverage,
          shifts,
          risks: [`已联动${linkedForecast.rangeLabel}预测：首日预计 ${linkedForecast.predictedTrafficFirstDayValue} 人次。`, ...(schedule.risks || [])].slice(0, 4)
        }
      });
    });
  },

  generateSchedule() {
    this.setData({
      generated: true
    });
    wx.showToast({
      title: '已生成建议',
      icon: 'success'
    });
  }
});
