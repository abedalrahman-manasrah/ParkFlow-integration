const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');
const { formatPlate, normalizePlate, isValidPlate } = createClientLoader()('@parkflow/client/utils/plate');

for (const { input, displayed } of [
  { input: '612345', displayed: '6-1234-5' },
  { input: '6123456', displayed: '6-1234-56' },
  { input: '61234567', displayed: '6-1234-567' },
]) {
  test('formatting plate ' + input + ' preserves every accepted digit', () => {
    assert.equal(isValidPlate(input), true);
    assert.equal(formatPlate(input), displayed);
    assert.equal(normalizePlate(formatPlate(input)), input);
    assert.equal(formatPlate(displayed), displayed);
  });
}
