const mock = require('../data/mock');
const forecastData = require('../data/forecast-data');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mockResponse(value, delay) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(clone(value)), delay || 120);
  });
}

function getDashboard() {
  return mockResponse(mock.dashboard);
}

function getForecast(range) {
  const selected = mock.forecastByRange[range] || mock.forecastByRange.tomorrow;
  return mockResponse(selected);
}

function getForecastHistory() {
  return mockResponse({
    rows: forecastData.forecastHistory,
    meta: {
      sourceType: '内置示例',
      rawCount: forecastData.forecastHistory.length,
      validCount: forecastData.forecastHistory.length,
      invalidCount: 0
    }
  });
}

function getSchedule() {
  return mockResponse(mock.schedule);
}

function getReplenishItems() {
  return mockResponse(mock.replenishItems);
}

module.exports = {
  getDashboard,
  getForecast,
  getForecastHistory,
  getSchedule,
  getReplenishItems
};
