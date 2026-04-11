export interface DashboardFinancials {
  total_revenue: number;
  producer_revenue: number;
  ikigembe_commission: number;
  revenue_today: number;
  revenue_this_month: number;
  total_paid_to_producers: number;
  total_profit: number;
}

export interface DashboardOverview {
  total_viewers: number;
  total_producers: number;
  total_movies: number;
  total_views: number;
  financials: DashboardFinancials;
}

export interface ViewerItem {
  id: number;
  name: string;
  payment_count: number;
  total_paid_rwf: number;
  last_payment_date: string | null;
  is_active: boolean;
}

export interface ViewerDetail {
  id: number;
  name: string;
  email: string;
  phone_number: string | null;
  movies_watched: number;
  total_paid_rwf: number;
  is_active: boolean;
  date_joined: string;
}

export interface ProducerItem {
  id: number;
  name: string;
  email: string;
  phone_number: string | null;
  movies_uploaded: number;
  total_earnings: number;
  balance: number;
  pending_withdrawals: number;
  total_withdrawn: number;
  is_active: boolean;
  date_joined: string;
}

export interface PaymentItem {
  id: number;
  user: string;
  movie_title: string;
  amount: number;
  status: string;
  created_at: string;
}

export interface WithdrawalItem {
  id: number;
  producer_name: string;
  producer_email: string;
  amount: number;
  status: string;
  payment_method: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  momo_number: string | null;
  momo_provider: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface TransactionHistory {
  payments: PaymentItem[];
  withdrawals: WithdrawalItem[];
  pending_withdrawals: WithdrawalItem[];
}

export interface CreateProducerRequest {
  email: string;
  phone_number: string;
  first_name: string;
  last_name: string;
}

export interface AdminMovie {
  id: number;
  title: string;
  producer: string;
  duration_minutes: number;
  price: number;
  release_date: string;
  trailer_url: string | null;
  thumbnail_url: string | null;
}

export interface MovieFormData {
  title: string;
  producer: string;
  duration_minutes: number;
  price: number;
  release_date: string;
  trailer_url: string;
}

// ── Producer report ───────────────────────────────────
export interface ProducerReportProfile {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  address: string;
  copyright_code: string;
  total_earnings: number;
  balance: number;
  pending_withdrawals: number;
  total_withdrawn: number;
}

export interface ProducerReportMovie {
  id: number;
  title: string;
  price: number;
  views: number;
  release_date: string;
  total_revenue: number;
  purchase_count: number;
  producer_share: number;
}

export interface ProducerReport {
  producer: ProducerReportProfile;
  movies: ProducerReportMovie[];
}

export interface MoviePurchaseItem {
  payment_id: number;
  buyer_name: string;
  phone_number: string | null;
  amount: number;
  status: string;
  deposit_id: string | null;
  purchased_at: string;
}

export interface MoviePurchaseList {
  page: number;
  total_results: number;
  total_pages: number;
  results: MoviePurchaseItem[];
}

export interface ResetPasswordResponse {
  temporary_password: string;
  user_id: number;
  message: string;
}

// ── Report interfaces ──────────────────────────────────
export interface RevenueTrendItem {
  period_start: string;
  total_revenue: number;
  producer_share: number;
  ikigembe_commission: number;
  purchase_count: number;
}

export interface TopMovieItem {
  id: number;
  title: string;
  producer: string;
  views: number;
  purchase_count: number;
  total_revenue: number;
  producer_share: number;
}

export interface UserGrowthItem {
  month: string;
  viewers: number;
  producers: number;
  total: number;
}

export interface WithdrawalSummaryItem {
  month: string;
  completed: number;
  rejected: number;
  pending: number;
  request_count: number;
}
