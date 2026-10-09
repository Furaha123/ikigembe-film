import { Observable } from 'rxjs';

/** Paginated list shape used by the marketplace endpoints. */
export interface Paginated<T> {
  page: number;
  results: T[];
  total_results: number;
  total_pages: number;
}

/** 202 from every marketplace purchase endpoint; poll /payments/<deposit_id>/status/ afterwards. */
export interface ServicePurchaseAccepted {
  deposit_id: string;
  status: 'Pending';
  message: string;
  amount: number;
  currency: string;
  /** Backend PAYMENT_DEMO_MODE: no gateway was called and no money moves. */
  demo?: boolean;
  /** Hosted payment page (DPO, or the demo checkout). */
  payment_url?: string;
  actor_video_id?: number;
  casting_call_id?: number;
}

export interface PhonePayload {
  /** Omitted when the gateway collects payment details itself (DPO). */
  phone_number?: string;
}

/**
 * A non-movie purchase handed to PaymentModalComponent: labels plus the call
 * that starts the MoMo deposit. Polling is shared with movie purchases.
 */
export interface ServicePurchase {
  titleKey: string;
  descriptionKey?: string;
  quote: () => Observable<ServiceQuote>;
  /** Set to let an unconfirmed payment be resumed after a reload (see PaymentService.rememberPending). */
  pendingKey?: string;
  /** In-app page to come back to after a hosted-page payment (DPO). */
  returnTo?: string;
  /** phoneNumber is null when the gateway collects payment details itself (DPO). */
  initiate: (phoneNumber: string | null) => Observable<ServicePurchaseAccepted>;
}

export interface ServiceQuote {
  amount: number;
  currency: string;
  access_days: number | null;
}

// ── Actor (Viewer with an actor profile) ────────────────────────────────

export type ActorGender = 'female' | 'male' | 'other';

export interface ActorProfile {
  stage_name: string;
  bio: string;
  gender: ActorGender | '';
  location: string;
  /** Rwanda province name (optional — backend may not yet persist separately). */
  province?: string;
  /** Rwanda district name (optional — backend may not yet persist separately). */
  district?: string;
  languages: string[];
  skills: string[];
  contact_email: string;
  contact_phone: string;
  is_listed: boolean;
  /** YYYY-MM-DD; drives the talent-video fee (under 30 vs 30+). */
  date_of_birth: string;
  created_at: string;
  updated_at: string;
}

export type ActorProfilePayload = Omit<ActorProfile, 'created_at' | 'updated_at'>;

/**
 * Server lifecycle (apps/marketplace/media.py): pending_upload → processing → pending_review → approved/rejected;
 * a failed server check is upload_failed (re-upload on the same paid slot, free); replaced = superseded by an
 * approved replacement; removed = deleted by the actor or taken down by an admin.
 */
export type ActorVideoStatus =
  | 'pending_upload' | 'processing' | 'upload_failed' | 'pending_review' | 'approved' | 'rejected' | 'replaced' | 'removed';

export type ServicePaymentStatus = 'Pending' | 'Completed' | 'Failed';

export interface ActorVideo {
  id: number;
  actor_id: number;
  title: string;
  description: string;
  status: ActorVideoStatus;
  reject_reason: string | null;
  /** Why the server's upload check failed (upload_failed); the actor can upload again for free. */
  failure_reason?: string;
  payment_status: ServicePaymentStatus | null;
  amount: number | null;
  /** Age band the fee was computed from at purchase. */
  fee_band?: 'under_30' | '30_plus' | '';
  /** Signed, expiring URL — never persist it. */
  video_url: string | null;
  /** Signed, expiring poster frame — never persist it. */
  thumbnail_url?: string | null;
  /** Measured by the server after upload. */
  size_bytes?: number | null;
  duration_seconds?: number | null;
  /** The approved video this paid slot replaces once approved. */
  replaces_id?: number | null;
  /** The paid slot accepts an upload now (first upload, or a free retry). */
  can_upload?: boolean;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActorVideoPurchasePayload extends PhonePayload {
  title: string;
  description?: string;
  /** Approved video to replace (it stays live until the new one is approved). */
  replaces?: number;
}

// ── Casting ─────────────────────────────────────────────────────────────

/** draft → (paid) pending_review → (admin) published | rejected; closed at the deadline; removed by moderation. */
export type CastingCallStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'closed' | 'removed';

export interface CastingCall {
  id: number;
  producer_id: number;
  producer_name: string;
  studio_name: string | null;
  title: string;
  description: string;
  roles: string[];
  deadline_at: string;
  status: CastingCallStatus;
  published_at: string | null;
  payment_status: ServicePaymentStatus | null;
  /** Reason given with the last rejection (rejected calls). */
  review_note?: string;
  removal_reason?: string | null;
  reviewed_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
  // Extended fields — stored by the backend when provided; absent on older records.
  poster_url?: string | null;
  project_type?: string;
  genre?: string;
  shooting_location?: string;
  project_start_date?: string | null;
  project_end_date?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  gender_preference?: ActorGender | '';
  num_actors?: number | null;
  // Physical requirements
  height_min?: number | null;
  height_max?: number | null;
  body_type?: string;
  complexion?: string;
  appearance_notes?: string;
  // Skills & languages
  required_skills?: string[];
  required_languages?: string[];
  // Availability
  availability_notes?: string;
}

export interface CastingCallPayload {
  title: string;
  description: string;
  roles: string[];
  /** Future ISO datetime. */
  deadline_at: string;
  project_type?: string;
  genre?: string;
  shooting_location?: string;
  project_start_date?: string | null;
  project_end_date?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  gender_preference?: ActorGender | '';
  num_actors?: number | null;
  height_min?: number | null;
  height_max?: number | null;
  body_type?: string;
  complexion?: string;
  appearance_notes?: string;
  required_skills?: string[];
  required_languages?: string[];
  availability_notes?: string;
}

/** Search/filter params for the public casting-calls list. */
export interface CastingCallFilters {
  search?: string;
  gender?: ActorGender;
  location?: string;
  page?: number;
}

export interface DirectoryVideo {
  id: number;
  title: string;
  description: string;
  /** Signed, expiring URL — never persist it. */
  video_url: string | null;
  created_at: string;
}

export type ApplicationStatus = 'submitted' | 'shortlisted' | 'declined';

export interface CastingApplication {
  id: number;
  casting_call_id: number;
  casting_call_title: string;
  actor_id: number;
  stage_name: string | null;
  note: string;
  videos: DirectoryVideo[];
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export interface ApplyPayload {
  note?: string;
  /** The actor's own approved videos. */
  video_ids: number[];
}

// ── Producer actor directory ────────────────────────────────────────────

export interface ActorSearchAccess {
  active: boolean;
  expires_at: string | null;
}

export interface DirectoryActor {
  id: number;
  stage_name: string;
  bio: string;
  gender: ActorGender | '';
  age: number | null;
  location: string;
  province?: string;
  district?: string;
  languages: string[];
  skills: string[];
  contact_email: string;
  contact_phone: string;
}

export interface DirectoryActorDetail extends DirectoryActor {
  videos: DirectoryVideo[];
}

export interface DirectoryFilters {
  q?: string;
  gender?: ActorGender | '';
  min_age?: number | null;
  max_age?: number | null;
  location?: string;
  skill?: string;
  language?: string;
  page?: number;
}

export interface ShortlistEntry {
  id: number;
  actor: DirectoryActor;
  note: string;
  created_at: string;
}

export interface AdminActionResponse {
  detail: string;
}
