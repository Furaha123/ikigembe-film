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
  /** Set to let an unconfirmed payment be resumed after a reload (see PaymentService.rememberPending). */
  pendingKey?: string;
  /** In-app page to come back to after a hosted-page payment (DPO). */
  returnTo?: string;
  /** phoneNumber is null when the gateway collects payment details itself (DPO). */
  initiate: (phoneNumber: string | null) => Observable<ServicePurchaseAccepted>;
}

// ── Actor (Viewer with an actor profile) ────────────────────────────────

export type ActorGender = 'female' | 'male' | 'other';

export interface ActorProfile {
  stage_name: string;
  bio: string;
  gender: ActorGender | '';
  location: string;
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

export type ActorVideoStatus =
  | 'pending_upload' | 'processing' | 'pending_review' | 'approved' | 'rejected' | 'removed';

export type ServicePaymentStatus = 'Pending' | 'Completed' | 'Failed';

export interface ActorVideo {
  id: number;
  actor_id: number;
  title: string;
  description: string;
  status: ActorVideoStatus;
  reject_reason: string | null;
  payment_status: ServicePaymentStatus | null;
  amount: number | null;
  /** Signed, expiring URL — never persist it. */
  video_url: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActorVideoPurchasePayload extends PhonePayload {
  title: string;
  description?: string;
}

// ── Casting ─────────────────────────────────────────────────────────────

export type CastingCallStatus = 'draft' | 'published' | 'closed' | 'removed';

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
  created_at: string;
  updated_at: string;
}

export interface CastingCallPayload {
  title: string;
  description: string;
  roles: string[];
  /** Future ISO datetime. */
  deadline_at: string;
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
