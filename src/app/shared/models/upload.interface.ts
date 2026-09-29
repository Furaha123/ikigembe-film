import { Observable } from 'rxjs';

export interface MultipartInitiateResponse {
  upload_id: string;
  file_key: string;
}

export interface MultipartSignPartResponse {
  url: string;
}

export interface MultipartPart {
  PartNumber: number;
  ETag: string;
}

/**
 * The four backend calls behind a multipart upload. Movie uploads and (later)
 * actor-video uploads expose the same shape on different URLs.
 */
export interface MultipartUploadApi {
  initiate(file: File): Observable<MultipartInitiateResponse>;
  signPart(uploadId: string, fileKey: string, partNumber: number): Observable<MultipartSignPartResponse>;
  complete(uploadId: string, fileKey: string, parts: MultipartPart[]): Observable<unknown>;
  abort(uploadId: string, fileKey: string): Observable<unknown>;
}

export interface MultipartUploadOptions {
  onProgress?: (pct: number) => void;
  /** Aborting cancels the in-flight chunk and aborts the upload on the server. */
  signal?: AbortSignal;
  chunkSize?: number;
}
