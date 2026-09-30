import { HttpErrorResponse } from '@angular/common/http';
import { UploadAbortedError, UploadError } from '../services/multipart-upload.service';
import { staleResubmitKey, uploadErrorMessage } from './upload-error';
import { ALLOWED_DOCUMENT_EXTENSIONS, ALLOWED_VIDEO_EXTENSIONS, extensionList, hasAllowedExtension } from '../models/upload.constants';

const http = (status: number, error: string) => new HttpErrorResponse({ status, error: { error } });

describe('uploadErrorMessage', () => {
  it('session errors → translated "start again" message', () => {
    expect(uploadErrorMessage(new UploadError('session', 403, 'This upload does not belong to your account.'), 'fallback'))
      .toBe('uploadErrors.sessionExpired');
  });

  it('storage errors → the caller\'s fallback', () => {
    expect(uploadErrorMessage(new UploadError('storage', 500, 'Part 1 failed (500)'), 'fallback')).toBe('fallback');
  });

  it('API errors with a backend message show it (e.g. inactive producer on initiate)', () => {
    expect(uploadErrorMessage(http(403, 'Your producer account is not active.'), 'fallback'))
      .toBe('Your producer account is not active.');
  });

  it('cancelled uploads are silent', () => {
    expect(uploadErrorMessage(new UploadAbortedError(), 'fallback')).toBeNull();
  });

  it('anything else → fallback', () => {
    expect(uploadErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});

describe('staleResubmitKey', () => {
  it('recognises the two "not uploaded by this account" cases', () => {
    expect(staleResubmitKey(http(400, 'video_key was not uploaded by this account or has expired.'))).toBe('video');
    expect(staleResubmitKey(http(400, 'copyright_document_key was not uploaded by this account or has expired.'))).toBe('copyright');
  });

  it('ignores the other 400 reasons', () => {
    expect(staleResubmitKey(http(400, 'video_key: Must be a key under movies/full/'))).toBeNull();
    expect(staleResubmitKey(http(400, 'copyright_document_key must be uploaded with field_name=copyright_document.'))).toBeNull();
    expect(staleResubmitKey(new Error('x'))).toBeNull();
  });
});

describe('allowed upload types (mirror the backend)', () => {
  it('videos: .mp4 .mov .avi .mkv, case-insensitive', () => {
    for (const name of ['film.mp4', 'MOVIE.MP4', 'a.mov', 'b.AVI', 'c.mkv']) {
      expect(hasAllowedExtension(name, ALLOWED_VIDEO_EXTENSIONS)).withContext(name).toBeTrue();
    }
    for (const name of ['clip.webm', 'setup.exe', 'notes.docx', 'film.mp4.exe', 'noextension', 'reel.m4v']) {
      expect(hasAllowedExtension(name, ALLOWED_VIDEO_EXTENSIONS)).withContext(name).toBeFalse();
    }
  });

  it('documents: .pdf .jpg .jpeg .png', () => {
    for (const name of ['rights.pdf', 'SCAN.JPG', 'a.jpeg', 'b.png']) {
      expect(hasAllowedExtension(name, ALLOWED_DOCUMENT_EXTENSIONS)).withContext(name).toBeTrue();
    }
    for (const name of ['rights.docx', 'x.exe', 'y.webm']) {
      expect(hasAllowedExtension(name, ALLOWED_DOCUMENT_EXTENSIONS)).withContext(name).toBeFalse();
    }
  });

  it('lists the types for messages', () => {
    expect(extensionList(ALLOWED_VIDEO_EXTENSIONS)).toBe('.mp4, .mov, .avi, .mkv');
  });
});
