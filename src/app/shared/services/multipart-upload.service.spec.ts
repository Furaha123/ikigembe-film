import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/services/auth.service';
import { of, throwError } from 'rxjs';
import { MultipartUploadApi } from '../models/upload.interface';
import { HttpErrorResponse } from '@angular/common/http';
import { MultipartUploadService, UploadAbortedError, UploadError } from './multipart-upload.service';

describe('MultipartUploadService', () => {
  let service: MultipartUploadService;
  let api: jasmine.SpyObj<MultipartUploadApi>;
  let fetchSpy: jasmine.Spy;

  const KEY = 'movies/full/abc.mp4';
  const okResponse = (etag: string) => new Response(null, { status: 200, headers: { ETag: etag } });
  const fileOf = (bytes: number) => new File([new Uint8Array(bytes)], 'movie.mp4', { type: 'video/mp4' });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { isLoggedIn: signal(true) } }] });
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

describe('MultipartUploadService — upload security follow-ups', () => {
  let service: MultipartUploadService;
  let api: jasmine.SpyObj<MultipartUploadApi>;
  let fetchSpy: jasmine.Spy;
  let loggedIn: ReturnType<typeof signal<boolean>>;

  const KEY = 'movies/full/7/abc.mp4';
  const ok = () => Promise.resolve(new Response(null, { status: 200, headers: { ETag: '"e"' } }));
  const status = (code: number) => Promise.resolve(new Response(null, { status: code }));
  const forbidden = () => throwError(() => new HttpErrorResponse({
    status: 403, error: { error: 'This upload does not belong to your account.' },
  }));
  const file = (bytes = 5) => new File([new Uint8Array(bytes)], 'film.mp4', { type: 'video/mp4' });

  beforeEach(() => {
    loggedIn = signal(true);
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { isLoggedIn: loggedIn } }] });
    service = TestBed.inject(MultipartUploadService);
    api = jasmine.createSpyObj<MultipartUploadApi>('api', ['initiate', 'signPart', 'complete', 'abort']);
    api.initiate.and.returnValue(of({ upload_id: 'up-1', file_key: KEY }));
    api.signPart.and.callFake((_u: string, _k: string, n: number) => of({ url: `https://r2.test/part${n}` }));
    api.complete.and.returnValue(of({ status: 'ok' }));
    api.abort.and.returnValue(of({ status: 'aborted' }));
    fetchSpy = spyOn(window, 'fetch');
  });

  it('403 from sign-part → typed session error, best-effort abort, no retry', async () => {
    api.signPart.and.returnValue(forbidden());

    const err = await service.upload(file(), api, { chunkSize: 10 }).catch((e: unknown) => e);

    expect(err).toEqual(jasmine.any(UploadError));
    expect((err as UploadError).kind).toBe('session');
    expect((err as UploadError).detail).toBe('This upload does not belong to your account.');
    expect(api.signPart).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(api.abort).toHaveBeenCalledOnceWith('up-1', KEY);
  });

  it('403 from complete → typed session error and abort', async () => {
    fetchSpy.and.callFake(ok);
    api.complete.and.returnValue(forbidden());

    const err = await service.upload(file(), api, { chunkSize: 10 }).catch((e: unknown) => e);

    expect((err as UploadError).kind).toBe('session');
    expect(api.complete).toHaveBeenCalledTimes(1);
    expect(api.abort).toHaveBeenCalledTimes(1);
  });

  it('403 from initiate is passed through unchanged (e.g. inactive producer account)', async () => {
    api.initiate.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 403, error: { error: 'Your producer account is not active.' },
    })));
    const err = await service.upload(file(), api).catch((e: unknown) => e);
    expect(err).toEqual(jasmine.any(HttpErrorResponse));
    expect(err).not.toEqual(jasmine.any(UploadError));
  });

  it('403 from a part PUT (expired presigned URL) → re-signs that part once and succeeds', async () => {
    fetchSpy.and.returnValues(status(403), ok());

    const key = await service.upload(file(), api, { chunkSize: 10 });

    expect(key).toBe(KEY);
    expect(api.signPart.calls.allArgs()).toEqual([['up-1', KEY, 1], ['up-1', KEY, 1]]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(api.abort).not.toHaveBeenCalled();
  });

  it('a second 403 from the part PUT fails with a storage error', async () => {
    fetchSpy.and.returnValues(status(403), status(403));

    const err = await service.upload(file(), api, { chunkSize: 10 }).catch((e: unknown) => e);

    expect((err as UploadError).kind).toBe('storage');
    expect((err as UploadError).status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(api.abort).toHaveBeenCalledTimes(1);
  });

  it('other part failures are not retried', async () => {
    fetchSpy.and.returnValue(status(500));
    const err = await service.upload(file(), api, { chunkSize: 10 }).catch((e: unknown) => e);
    expect((err as UploadError).kind).toBe('storage');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('a caller abort still yields UploadAbortedError', async () => {
    const controller = new AbortController();
    fetchSpy.and.callFake(() => { controller.abort(); return ok(); });
    await expectAsync(service.upload(file(25), api, { chunkSize: 10, signal: controller.signal }))
      .toBeRejectedWith(jasmine.any(UploadAbortedError));
    expect(api.abort).toHaveBeenCalledTimes(1);
  });

  it('logging out cancels uploads in flight (UploadAbortedError + server-side abort)', async () => {
    let releasePut!: () => void;
    fetchSpy.and.callFake((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      releasePut = () => resolve(new Response(null, { status: 200 }));
    }));

    const pending = service.upload(file(25), api, { chunkSize: 10 });
    await new Promise(r => setTimeout(r)); // reach the first part PUT
    loggedIn.set(false);
    TestBed.flushEffects();

    await expectAsync(pending).toBeRejectedWith(jasmine.any(UploadAbortedError));
    expect(api.abort).toHaveBeenCalledOnceWith('up-1', KEY);
    expect(releasePut).toBeDefined();
  });
});
