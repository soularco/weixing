const mock = require('../data/mock');

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

function getSchedule() {
  return mockResponse(mock.schedule);
}

function getReplenishItems() {
  return mockResponse(mock.replenishItems);
}

module.exports = {
  getDashboard,
  getForecast,
  getSchedule,
  getReplenishItems
};
