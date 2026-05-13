'use strict';

// Registry: add new parsers here (e.g. amazon, ozon, wildberries…)
const PARSERS = {
  steam: require('./steam'),
};

module.exports = PARSERS;
