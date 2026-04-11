/**
 * Basic unit test suite using Node.js native test runner.
 * Run with: node --test tests/
 */
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const UIEngine = require('../core/UIEngine');
const CacheLayer = require('../core/CacheLayer');
const { CommandEngine } = require('../core/CommandEngine');
const ServiceContainer  = require('../core/ServiceContainer');

test('Core Engines Load Without Syntax Errors', async (t) => {
  await t.test('UIEngine design tokens', () => {
    assert.ok(UIEngine.COLORS);
    assert.equal(UIEngine.COLORS.primary, '#7C3AED');
    assert.equal(typeof UIEngine.init, 'function');
  });

  await t.test('CacheLayer instantiation', () => {
    const mockDb = { get: async () => null, set: async () => {}, delete: async () => {} };
    const cache  = new CacheLayer(mockDb);
    assert.ok(cache);
    assert.equal(typeof cache.get, 'function');
  });

  await t.test('CommandEngine exists', () => {
    const engine = new CommandEngine({});
    assert.ok(engine);
    assert.equal(typeof engine.execute, 'function');
  });

  await t.test('ServiceContainer DI', () => {
    const sc = new ServiceContainer();
    sc.register('mock_svc', { start: () => {}, health: async () => {} });
    assert.ok(sc.providers.has('mock_svc'));
  });
});
