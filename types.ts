
export type Language = 
  | 'pt-BR' | 'pt-PT' | 'es-ES' | 'es-AR' | 'it' | 'fr' 
  | 'uk' | 'ru' | 'de' | 'de-CH' | 'ga' | 'zh' | 'ja' | 'hi' | 'en';

export type Currency = string;

export interface AppBanner {
  id: string;
  title: string;
  highlight: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
  image_url?: string;
  theme_color: 'emerald' | 'purple' | 'amber' | 'rose' | 'blue';
  is_active: boolean;
  user_type: 'all' | 'free' | 'premium' | 'public' | 'push_notification';
  created_at?: string;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  email: string;
  phone?: string;
  nif?: string;
  niss?: string;
  total_sales: number;
  commission_rate: number;
  discount_rate?: number;
  created_at: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  nif?: string;
  niss?: string;
  photo: string | null;
  hourlyRate: number;
  country?: string;
  vendor_code?: string;
  defaultEntry: string;
  defaultExit: string;
  socialSecurity: { value: number; type: 'percentage' | 'fixed' };
  irs: { value: number; type: 'percentage' | 'fixed' };
  isFreelancer: boolean;
  vat: { value: number; type: 'percentage' | 'fixed' };
  role: 'admin' | 'user' | 'vendor' | 'support';
  overtimeRates: {
    h1: number;
    h2: number;
    h3: number;
  };
  subscription?: {
    id: string;
    status?: string;
    startDate: string;
    isActive: boolean;
    appliedDiscount?: number;
    custom_commission?: number;
    custom_discount?: number;
    master_global_commission?: number;
    master_global_discount?: number;
  };
  settings?: {
    language: Language;
    currency: Currency;
  };
  created_at?: string;
}

export interface WorkRecord {
  date: string;
  entry: string;
  exit: string;
  isAbsent: boolean;
  isVacation?: boolean;
  hasLunchBreak: boolean;
  notes: string;
  location: string;
  advance: number;
  extraHours: {
    h1: number;
    h2: number;
    h3: number;
  };
  travelPayment?: number;
  travelHours?: number;
  partTimeHours?: number;
  partTimeRate?: number;
  partTimeServiceValue?: number;
  partTimeServiceDesc?: string;
  partTimeNotes?: string;
  partTimeApplyIva?: boolean;
  partTimeIvaRate?: number;
}

export interface FinanceSummary {
  daysWorked: number;
  totalHours: number;
  totalExtraHours: number;
  extraHoursValue: number;
  extraHoursH1Total?: number;
  extraHoursH2Total?: number;
  extraHoursH3Total?: number;
  extraHoursH1Value?: number;
  extraHoursH2Value?: number;
  extraHoursH3Value?: number;
  socialSecurityTotal: number;
  irsTotal: number;
  advancesTotal: number;
  grossTotal: number;
  netTotal: number;
  ivaTotal: number;
  totalTravelHours?: number;
  totalTravelPayment?: number;
}

export type AppState = 'splash' | 'language-gate' | 'landing' | 'subscription' | 'login' | 'dashboard' | 'finance' | 'reports' | 'part-time' | 'settings' | 'admin' | 'accountant' | 'vendor-detail' | 'vendor-sales' | 'support' | 'user-support' | 'privacy' | 'terms' | 'about-atrioswork';
