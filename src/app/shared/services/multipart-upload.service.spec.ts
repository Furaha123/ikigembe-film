import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MultipartUploadApi } from '../models/upload.interface';
import { MultipartUploadService, UploadAbortedError } from './multipart-upload.service';

describe('MultipartUploadService', () => {
  let service: MultipartUploadService;
  let api: jasmine.SpyObj<MultipartUploadApi>;
  let fetchSpy: jasmine.Spy;

  const KEY = 'movies/full/abc.mp4';
  const okResponse = (etag: string) => new Response(null, { status: 200, headers: { ETag: etag } });
  const fileOf = (bytes: number) => new File([new Uint8Array(bytes)], 'movie.mp4', { type: 'video/mp4' });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MultipartUploadService);
    api = jasmine.createSpyObj<MultipartUploadApi>('api', ['initiate', 'signPart', 'complete', 'abort']);
    api.initiate.and.returnValue(of({ upload_id: 'up-1', file_key: KEY }));
    api.signPart.and.callFake((_u: string, _k: string, n: number) => of({ url: `https://r2.test/part${n}` }));
    api.complete.and.returnValue(of({ status: 'ok' }));
    api.abort.and.returnValue(of({ status: 'aborted' }));
    fetchSpy = spyOn(window, 'fetch');
  });

  it('uploads every chunk, reports progress and completes with the ETags', async () => {
    fetchSpy.and.callFake((url: string) => Promise.resolve(okResponse(`"etag-${url.slice(-1)}"`)));
    const progress: number[] = [];

    const key = await service.upload(fileOf(25), api, { chunkSize: 10, onProgress: p => progress.push(p) });

    expect(key).toBe(KEY);
    expect(api.signPart.calls.allArgs()).toEqual([['up-1', KEY, 1], ['up-1', KEY, 2], ['up-1', KEY, 3]]);
    expect(fetchSpy.calls.count()).toBe(3);
    expect(fetchSpy.calls.argsFor(0)[1].method).toBe('PUT');
    expect(progress).toEqual([33, 67, 100]);
    expect(api.complete).toHaveBeenCalledWith('up-1', KEY, [
      { PartNumber: 1, ETag: '"etag-1"' },
      { PartNumber: 2, ETag: '"etag-2"' },
      { PartNumber: 3, ETag: '"etag-3"' },
    ]);
    expect(api.abort).not.toHaveBeenCalled();
  });

  it('aborts the server-side upload when a part fails', async () => {
    fetchSpy.and.returnValue(Promise.resolve(new Response(null, { status: 500 })));

    await expectAsync(service.upload(fileOf(5), api, { chunkSize: 10 })).toBeRejectedWithError(/Part 1 failed \(500\)/);
    expect(api.abort).toHaveBeenCalledWith('up-1', KEY);
    expect(api.complete).not.toHaveBeenCalled();
  });

  it('aborts the server-side upload when complete fails', async () => {
    fetchSpy.and.returnValue(Promise.resolve(okResponse('"e"')));
    api.complete.and.returnValue(throwError(() => new Error('boom')));

    await expectAsync(service.upload(fileOf(5), api, { chunkSize: 10 })).toBeRejected();
    expect(api.abort).toHaveBeenCalledTimes(1);
  });

  it('stops and aborts when cancelled via the AbortSignal', async () => {
    const controller = new AbortController();
    fetchSpy.and.callFake(() => { controller.abort(); return Promise.resolve(okResponse('"e"')); });

    await expectAsync(service.upload(fileOf(25), api, { chunkSize: 10, signal: controller.signal }))
      .toBeRejectedWith(jasmine.any(UploadAbortedError));
    expect(fetchSpy.calls.count()).toBe(1);
    expect(api.abort).toHaveBeenCalledWith('up-1', KEY);
    expect(api.complete).not.toHaveBeenCalled();
  });

  it('does not start when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    await expectAsync(service.upload(fileOf(5), api, { signal: controller.signal }))
      .toBeRejectedWith(jasmine.any(UploadAbortedError));
    expect(api.initiate).not.toHaveBeenCalled();
  });
});
