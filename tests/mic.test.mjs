import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredInput, bluetoothInput } from '../site/js/audio/mic.js';

const withDevices = (labels) =>
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { enumerateDevices: async () => labels.map((label, i) => ({ kind: 'audioinput', label, deviceId: `id${i}` })) } },
  });

test("with Bluetooth earbuds connected, record from the phone's own mic", async () => {
  // The device list reported from a real Android phone with wireless earbuds.
  withDevices(['既定', 'Speakerphone', 'Headset earpiece', 'Bluetooth headset']);
  assert.equal(await preferredInput(), 'id1');
  assert.equal(await bluetoothInput(), true);
});

test('without Bluetooth, use the default mic', async () => {
  withDevices(['既定', 'Speakerphone', 'Headset earpiece']);
  assert.equal(await preferredInput(), null);
  assert.equal(await bluetoothInput(), false);
  withDevices(['Default', 'MacBook Pro Microphone']);
  assert.equal(await preferredInput(), null);
});

test('Bluetooth with no recognisable built-in mic falls back to the default', async () => {
  withDevices(['Default', 'Bluetooth headset']);
  assert.equal(await preferredInput(), null);
});
