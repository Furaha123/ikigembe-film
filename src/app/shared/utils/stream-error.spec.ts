import { HttpErrorResponse } from '@angular/common/http';
import { classifyStreamError } from './stream-error';

const httpError = (status: number, error?: string) =>
  new HttpErrorResponse({ status, error: error ? { error } : null });

describe('classifyStreamError', () => {
  it('403 view used → view_used, can buy again', () => {
    const d = classifyStreamError(httpError(403, 'Your view of this movie has been used. Purchase it again to watch.'));
    expect(d.kind).toBe('view_used');
    expect(d.canBuy).toBeTrue();
    expect(d.text).toBe('Your view of this movie has been used. Purchase it again to watch.');
  });

  it('403 another device → other_device, no buy action', () => {
    const d = classifyStreamError(httpError(403, 'This purchase is already being watched on another device.'));
    expect(d.kind).toBe('other_device');
    expect(d.canBuy).toBeFalse();
  });

  it('403 purchase required → purchase_required, can buy', () => {
    const d = classifyStreamError(httpError(403, 'Purchase required to stream this movie.'));
    expect(d.kind).toBe('purchase_required');
    expect(d.canBuy).toBeTrue();
  });

  it('403 without a body still falls back to a translated key', () => {
    const d = classifyStreamError(httpError(403));
    expect(d.kind).toBe('purchase_required');
    expect(d.text).toBeNull();
    expect(d.key).toBe('viewer.stream.purchaseRequired');
  });

  it('400 missing device id → generic error, never the raw message', () => {
    const d = classifyStreamError(httpError(400, 'X-Device-Id header is required.'));
    expect(d.kind).toBe('device_id_missing');
    expect(d.text).toBeNull();
    expect(d.key).toBe('viewer.stream.failed');
    expect(d.canBuy).toBeFalse();
  });

  it('404 → not_found', () => {
    expect(classifyStreamError(httpError(404, 'Movie not found')).kind).toBe('not_found');
  });

  it('network / unknown errors → generic', () => {
    const d = classifyStreamError(httpError(0));
    expect(d.kind).toBe('unknown');
    expect(d.key).toBe('viewer.stream.failed');
    expect(classifyStreamError(new Error('x')).kind).toBe('unknown');
  });
});
