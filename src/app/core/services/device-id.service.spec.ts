import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEVICE_ID_KEY, DeviceIdService } from './device-id.service';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('DeviceIdService', () => {
  const create = (platform: 'browser' | 'server' = 'browser') => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    return TestBed.inject(DeviceIdService);
  };

  beforeEach(() => localStorage.removeItem(DEVICE_ID_KEY));
  afterEach(() => localStorage.removeItem(DEVICE_ID_KEY));

  it('creates a UUID once and persists it under ikigembe_device_id', () => {
    const id = create().getId();
    expect(id).toMatch(UUID_V4);
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(id);
  });

  it('returns the same id on every call', () => {
    const service = create();
    const spy = spyOn(crypto, 'randomUUID').and.callThrough();
    const first = service.getId();
    expect(service.getId()).toBe(first);
    expect(service.getId()).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reuses a persisted id across app sessions', () => {
    localStorage.setItem(DEVICE_ID_KEY, 'existing-device-id');
    expect(create().getId()).toBe('existing-device-id');
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(create().getId()).toMatch(UUID_V4);
    } finally {
      delete (crypto as { randomUUID?: unknown }).randomUUID; // restore the prototype method
    }
  });

  it('is SSR-safe: returns null and never touches storage on the server', () => {
    const get = spyOn(Storage.prototype, 'getItem').and.callThrough();
    const set = spyOn(Storage.prototype, 'setItem').and.callThrough();
    expect(create('server').getId()).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('still returns a stable id when storage is blocked', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('SecurityError');
    const service = create();
    const id = service.getId();
    expect(id).toMatch(UUID_V4);
    expect(service.getId()).toBe(id);
  });
});
