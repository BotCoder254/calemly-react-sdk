import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(__dirname, '..');

test('dist artifacts are generated', () => {
  assert.equal(existsSync(path.join(sdkRoot, 'dist', 'index.js')), true);
  assert.equal(existsSync(path.join(sdkRoot, 'dist', 'index.mjs')), true);
  assert.equal(existsSync(path.join(sdkRoot, 'dist', 'index.css')), true);
});

test('sdk exports are available', async () => {
  const moduleUrl = pathToFileURL(path.join(sdkRoot, 'dist', 'index.mjs')).href;
  const sdk = await import(moduleUrl);

  assert.equal(typeof sdk.SchedulerProvider, 'function');
  assert.equal(typeof sdk.SchedulerWidget, 'function');
  assert.equal(typeof sdk.SchedulerContext, 'object');
  assert.equal(typeof sdk.useBooking, 'function');
  assert.equal(typeof sdk.SlotPicker, 'function');
  assert.equal(typeof sdk.BookingForm, 'function');
  assert.equal(typeof sdk.BookingSuccess, 'function');
  assert.equal(typeof sdk.CustomFormRenderer, 'function');
  assert.equal(typeof sdk.validateFormAnswers, 'function');
  assert.equal(typeof sdk.ConflictResolver, 'function');
  assert.equal(typeof sdk.PaymentCheckout, 'function');
  assert.equal(typeof sdk.BOOKING_STEPS, 'object');
});
