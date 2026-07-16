import test from 'node:test';
import assert from 'node:assert/strict';
import { VIETNAM_PHONE_PATTERN, isValidVietnamPhone, sanitizePhoneValue } from '../src/validation.js';

test('Vietnam phone regex accepts exactly local 10 digits or +84 form', () => {
  for (const valid of ['0312345678', '0512345678', '0712345678', '0812345678', '0912345678', '+84312345678', '+84512345678', '+84712345678', '+84812345678', '+84912345678']) {
    assert.equal(isValidVietnamPhone(valid), true, valid);
  }
  for (const invalid of ['091234567', '09123456789', '0212345678', '84912345678', '+840912345678', '+84123456789', '09abc45678', '']) {
    assert.equal(isValidVietnamPhone(invalid), false, invalid);
  }
});

test('phone input sanitizer blocks letters and enforces length', () => {
  assert.equal(sanitizePhoneValue('09ab12-345678999'), '0912345678');
  assert.equal(sanitizePhoneValue('+84 912 345 678 999'), '+84912345678');
  assert.equal(sanitizePhoneValue('++84912345678'), '+84912345678');
});

test('HTML pattern is a valid JavaScript regular expression', () => {
  assert.doesNotThrow(() => new RegExp(VIETNAM_PHONE_PATTERN));
  assert.equal(new RegExp(VIETNAM_PHONE_PATTERN).test('+84912345678'), true);
});
