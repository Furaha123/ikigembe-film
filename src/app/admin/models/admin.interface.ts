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
  email: string;
  phone_number: string | null;
  movies_watched: number;
  payments_made: number;
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
