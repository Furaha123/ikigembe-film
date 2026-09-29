import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MovieUploadField, MultipartInitiateResponse, MultipartPart, MultipartSignPartResponse, MultipartUploadApi,
} from '../models/upload.interface';

const BASE = `${environment.apiUrl}/movies/upload`;

/**
 * Movie-file multipart endpoints (`/movies/upload/*`), open to admins and active
 * producers. Large files (video, trailer) must go through here and be sent to
 * `/movies/create/` or `/movies/<id>/update/` as `video_key` / `trailer_key` —
 * those endpoints do not accept the raw video file.
 */
@Injectable({ providedIn: 'root' })
export class MovieUploadService {
  private readonly http = inject(HttpClient);

  initiate(fileName: string, fileType: string, fieldName: MovieUploadField): Observable<MultipartInitiateResponse> {
    return this.http.post<MultipartInitiateResponse>(`${BASE}/initiate/`,
      { file_name: fileName, file_type: fileType, field_name: fieldName });
  }

  signPart(uploadId: string, fileKey: string, partNumber: number): Observable<MultipartSignPartResponse> {
    return this.http.post<MultipartSignPartResponse>(`${BASE}/sign-part/`,
      { upload_id: uploadId, file_key: fileKey, part_number: partNumber });
  }

  complete(uploadId: string, fileKey: string, parts: MultipartPart[]): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${BASE}/complete/`, { upload_id: uploadId, file_key: fileKey, parts });
  }

  abort(uploadId: string, fileKey: string): Observable<unknown> {
    return this.http.post(`${BASE}/abort/`, { upload_id: uploadId, file_key: fileKey });
  }

  /** Endpoints for MultipartUploadService, bound to one `field_name` (it decides the bucket). */
  api(fieldName: MovieUploadField): MultipartUploadApi {
    return {
      initiate: (file) => this.initiate(file.name, file.type || 'application/octet-stream', fieldName),
      signPart: (uploadId, fileKey, partNumber) => this.signPart(uploadId, fileKey, partNumber),
      complete: (uploadId, fileKey, parts) => this.complete(uploadId, fileKey, parts),
      abort:    (uploadId, fileKey) => this.abort(uploadId, fileKey),
    };
  }
}
