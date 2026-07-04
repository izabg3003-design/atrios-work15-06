import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SplashScreen from './components/SplashScreen';
import LanguageGate from './components/LanguageGate';
import LandingPage from './components/LandingPage';
import SubscriptionPage from './components/SubscriptionPage';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import FinancePage from './components/FinancePage';
import PartTimePage from './components/PartTimePage';
import ReportsPage from './components/ReportsPage';
import AccountantPage from './components/AccountantPage';
import SettingsPage from './components/SettingsPage';
import AdminPage from './components/AdminPage';
import VendorDetailPage from './components/VendorDetailPage';
import VendorSalesPage from './components/VendorSalesPage';
import SupportPage from './components/SupportPage';
import UserSupportPage from './components/UserSupportPage';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import AboutAtriosWorkPage from './components/AboutAtriosWorkPage';
import PublicSupportChat from './components/PublicSupportChat';
import { AppState, UserProfile, WorkRecord, Language, Currency } from './types';
import { supabase, isConfigured } from './lib/supabase';
import { translations } from './translations';
import { X, Crown, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';

declare global {
  interface window {
    gtag: (...args: any[]) => void;
    jivo_api: {
      showWidget: () => void;
      hideWidget: () => void;
      open: () => void;
      close: () => void;
    };
  }
}

const DEFAULT_USER: UserProfile = {
  name: 'Membro AtriosWork',
  email: '',
  photo: null,
  hourlyRate: 10,
  defaultEntry: '09:00',
  defaultExit: '18:00',
  socialSecurity: { value: 11, type: 'percentage' },
  irs: { value: 15, type: 'percentage' },
  isFreelancer: false,
  vat: { value: 23, type: 'percentage' },
  role: 'user',
  overtimeRates: { h1: 50, h2: 75, h3: 100 },
  settings: { language: 'pt-PT', currency: 'EUR' }
};

const PremiumModal: React.FC<{ isOpen: boolean; onClose: () => void; onUpgrade: () => void }> = ({ isOpen, onClose, onUpgrade }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 md:p-6 bg-slate-950/80 backdrop-blur-xl animate-[fadeIn_0.3s_ease-out]">
      <div className="relative w-full max-w-2xl bg-slate-900 rounded-[3rem] overflow-hidden shadow-[0_0_100px_rgba(168,85,247,0.2)] border border-purple-500/30 animate-[modalScale_0.4s_ease-out]">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-50 p-2 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 md:p-12">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/40 animate-pulse">
              <Crown className="w-10 h-10 text-white" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl md:text-4xl font-black text-white italic uppercase tracking-tighter leading-none">
                AtriosWork <span className="text-purple-400">Premium</span>
              </h2>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Eleve a sua produtividade ao próximo nível</p>
            </div>

            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              {[
                'Relatórios Detalhados em PDF',
                'Exportação para Contabilista',
                'Gestão de Horas Extras Ilimitada',
                'Suporte Prioritário 24/7',
                'Análise de Rendimentos Anual',
                'Sem Limite de Horas Registadas'
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-tight">{feature}</span>
                </div>
              ))}
            </div>

            <div className="w-full space-y-4 pt-4">
              <button 
                onClick={onUpgrade}
                className="w-full py-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-[2rem] flex items-center justify-center gap-3 shadow-xl shadow-purple-500/20 transition-all hover:scale-[1.02] active:scale-95 text-xs uppercase tracking-[0.2em]"
              >
                Ativar Assinatura Anual <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                <Sparkles className="w-3 h-3 text-amber-400" /> Pagamento Seguro via Stripe
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('splash');
  const [authInitialized, setAuthInitialized] = useState(false);
  const [systemLang, setSystemLang] = useState<Language>('pt-PT');
  const [user, setUser] = useState<UserProfile>(DEFAULT_USER);
  const [records, setRecords] = useState<Record<string, WorkRecord>>({});
  const [selectedVendorData, setSelectedVendorData] = useState<any>(null);
  const [adminOverrideVendor, setAdminOverrideVendor] = useState<any>(null);
  const [authError, setAuthError] = useState<{ title: string, text: string } | null>(null);
  const [hideValues, setHideValues] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [loginInRegisterMode, setLoginInRegisterMode] = useState(false);
  
  const [now, setNow] = useState(new Date());
  const isInitialLoad = useRef(true);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isPro = useMemo(() => {
    const isMaster = user.email?.toLowerCase()?.includes('master@atrioswork.com') || user.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || user.email?.toLowerCase()?.includes('master@digitalnexus.com');
    const isAdmin = user.role === 'admin';
    
    if (isMaster || isAdmin) return true;
    if (user.status === 'PRO' || user.status === 'pro') return true;
    if (user.status === 'FREE' || user.status === 'free') return false;

    let sub: any = null;
    try {
      sub = typeof user.subscription === 'string' ? JSON.parse(user.subscription) : user.subscription;
    } catch (e) {
      sub = null;
    }
    const isPaid = sub?.status === 'ACTIVE_PAID';
    if (!isPaid) return false;
    
    if (sub?.expiryDate) {
      return new Date(sub.expiryDate) > now;
    }
    
    return true;
  }, [user, now]);

  const totalHours = useMemo(() => {
    return Object.values(records).reduce((acc, r) => {
      if (r.isAbsent) return acc;
      const [h1, m1] = r.entry.split(':').map(Number);
      const [h2, m2] = r.exit.split(':').map(Number);
      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (r.hasLunchBreak) diff -= 60;
      const baseHours = Math.max(0, diff / 60);
      const extra = (r.extraHours?.h1 || 0) + (r.extraHours?.h2 || 0) + (r.extraHours?.h3 || 0);
      return acc + baseHours + extra;
    }, 0);
  }, [records]);

  // Lista de estados considerados "Públicos" (Antes do Login)
  const PUBLIC_STATES: AppState[] = ['landing', 'privacy', 'terms', 'subscription', 'login', 'about-atrioswork', 'splash', 'language-gate'];

  useEffect(() => {
    const isPublicPage = PUBLIC_STATES.includes(appState);
    document.body.classList.toggle('jivo-visible', isPublicPage);

    const updateJivo = () => {
      try {
        const api = (window as any).jivo_api;
        if (api && typeof api.showWidget === 'function') {
          if (isPublicPage) api.showWidget();
          else { api.hideWidget(); if (typeof api.close === 'function') api.close(); }
        }
      } catch (e) {}
    };

    updateJivo();
    const interval = setInterval(() => {
      if (isPublicPage && !document.body.classList.contains('jivo-visible')) document.body.classList.add('jivo-visible');
      updateJivo();
    }, 300);
    const timeout = setTimeout(() => clearInterval(interval), 5000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [appState]);

  useEffect(() => {
    if (typeof (window as any).gtag === 'function' && appState !== 'splash') {
      (window as any).gtag('event', 'page_view', {
        page_location: window.location.href,
        page_path: `/${appState}`,
        send_to: 'G-YD6Q53C4K2'
      });
    }
  }, [appState]);

  const t = useCallback((key: string): any => {
    try {
      const parts = key.split('.');
      let result: any = translations['pt-PT'];
      for (const part of parts) {
        if (result && typeof result === 'object' && part in result) result = result[part];
        else { result = null; break; }
      }
      return result || key;
    } catch (e) { return key; }
  }, []);

  const formatCurrency = useCallback((value: number) => {
    if (hideValues) return "••••";
    try {
      // Forçado pt-PT para garantir que decimais usem vírgula e símbolo € à direita (padrão Portugal)
      return new Intl.NumberFormat('pt-PT', { 
        style: 'currency', 
        currency: 'EUR' 
      }).format(value);
    } catch (e) {
      return `${value.toFixed(2)} €`;
    }
  }, [hideValues]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(DEFAULT_USER);
    setAppState('landing');
    setAuthError(null);
    setSelectedVendorData(null);
    setAdminOverrideVendor(null);
  };

  const loadUserData = useCallback(async (userId: string, retryCount = 0) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.is_anonymous) { setAppState('landing'); setAuthInitialized(true); return; }

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!profile && retryCount < 3) { setTimeout(() => loadUserData(userId, retryCount + 1), 1000); return; }
      if (profile) {
        const sub = profile.subscription;
        let parsedSub: any = {};
        try {
          parsedSub = typeof sub === 'string' ? JSON.parse(sub) : (sub || {});
        } catch (e) {
          parsedSub = {};
        }
        const isSuspended = profile.status === 'SUSPENDED' || profile.status === 'suspended' || parsedSub.isActive === false;
        if (isSuspended && !profile.email?.toLowerCase()?.includes('master@atrioswork.com') && !profile.email?.toLowerCase()?.includes('izarellebraga@gmail.com') && !profile.email?.toLowerCase()?.includes('master@digitalnexus.com')) {
          await supabase.auth.signOut();
          setAuthError({ title: 'CONTA BLOQUEADA', text: 'Conta bloqueada pelo Administrador! Entre em contacto e solicite o desbloqueio!' });
          setAppState('login');
          setAuthInitialized(true);
          return;
        }
        setUser(profile);
        if (profile.email?.toLowerCase()?.includes('master@atrioswork.com') || profile.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || profile.email?.toLowerCase()?.includes('master@digitalnexus.com')) setAppState('admin');
        else if (profile.role === 'vendor') setAppState('vendor-detail');
        else if (profile.role === 'support') setAppState('support');
        else setAppState('dashboard');
        
        const { data: dbRecords } = await supabase.from('work_records').select('*').eq('user_id', userId);
        if (dbRecords) {
          const formatted: Record<string, WorkRecord> = {};
          dbRecords.forEach((r: any) => { if (r.data) formatted[r.date] = r.data; });
          setRecords(formatted);
        }
      } else setAppState('landing');
    } catch (e) { setAppState('landing'); }
    finally { setTimeout(() => setAuthInitialized(true), 100); }
  }, []);

  useEffect(() => {
    if (!isConfigured) { setAppState('landing'); return; }
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await loadUserData(session.user.id);
        } else {
          setAppState('landing');
          setAuthInitialized(true);
        }
      } catch (err) {
        console.error("Auth initialization failed directly (Failed to Fetch):", err);
        setAppState('landing');
        setAuthInitialized(true);
      }
    };
    if (isInitialLoad.current) { initAuth(); isInitialLoad.current = false; }
    
    let subscription: any;
    try {
      const { data } = supabase.auth.onAuthStateChange((event: any, session: any) => {
        if (event === 'SIGNED_IN' && session) { setAuthInitialized(false); loadUserData(session.user.id); }
        else if (event === 'SIGNED_OUT') { setAppState('landing'); setUser(DEFAULT_USER); setAuthInitialized(true); }
      });
      subscription = data?.subscription;
    } catch (err) {
      console.error("onAuthStateChange failed:", err);
    }
    
    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, [loadUserData]);

  useEffect(() => {
    if (appState === 'splash' && authInitialized) setAppState('language-gate');
  }, [appState, authInitialized]);

  useEffect(() => {
    if (!user.id) return;
    
    const isMaster = user.email?.toLowerCase()?.includes('master@atrioswork.com') || 
                     user.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || 
                     user.email?.toLowerCase()?.includes('master@digitalnexus.com');
                     
    if (isMaster) return;

    // 1. Realtime updates channel
    const channel = supabase
      .channel(`user-status-monitor-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        async (payload: any) => {
          const updatedProfile = payload.new;
          if (updatedProfile) {
            const sub = updatedProfile.subscription;
            let parsedSub: any = {};
            try {
              parsedSub = typeof sub === 'string' ? JSON.parse(sub) : (sub || {});
            } catch (e) {}
            const isSuspended = updatedProfile.status === 'SUSPENDED' || updatedProfile.status === 'suspended' || parsedSub?.isActive === false;
            if (isSuspended) {
              await supabase.auth.signOut();
              setUser(DEFAULT_USER);
              setAuthError({ 
                title: 'CONTA BLOQUEADA', 
                text: 'Conta bloqueada pelo Administrador! Entre em contacto e solicite o desbloqueio!' 
              });
              setAppState('login');
            }
          }
        }
      )
      .subscribe();

    // 2. Periodic polling fallback (every 5 seconds for rapid detection)
    const interval = setInterval(async () => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('status, subscription')
          .eq('id', user.id)
          .maybeSingle();
          
        if (profile && !error) {
          const sub = profile.subscription;
          let parsedSub: any = {};
          try {
            parsedSub = typeof sub === 'string' ? JSON.parse(sub) : (sub || {});
          } catch (e) {}
          const isSuspended = profile.status === 'SUSPENDED' || profile.status === 'suspended' || parsedSub?.isActive === false;
          if (isSuspended) {
            await supabase.auth.signOut();
            setUser(DEFAULT_USER);
            setAuthError({ 
              title: 'CONTA BLOQUEADA', 
              text: 'Conta bloqueada pelo Administrador! Entre em contacto e solicite o desbloqueio!' 
            });
            setAppState('login');
          }
        }
      } catch (e) {
        console.error("Error checking suspension fallback:", e);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user.id]);

  const handleTabChange = (tab: AppState) => {
    if (['reports', 'accountant'].includes(tab) && !isPro) {
      setIsPremiumModalOpen(true);
      return;
    }
    setAppState(tab);
  };

  return (
    <div className="min-h-screen text-slate-100 bg-[#020617] selection:bg-purple-500/30">
      <PremiumModal 
        isOpen={isPremiumModalOpen} 
        onClose={() => setIsPremiumModalOpen(false)} 
        onUpgrade={() => {
          setIsPremiumModalOpen(false);
          setAppState('subscription');
        }} 
      />
      {appState === 'splash' ? <SplashScreen t={t} /> : null}
      {appState === 'language-gate' && <LanguageGate onSelect={(lang) => { setSystemLang(lang); setAppState('landing'); }} />}
      {appState === 'landing' && (
        <LandingPage 
          onLogin={() => {
            setLoginInRegisterMode(false);
            setAppState('login');
          }} 
          onSubscribe={() => setAppState('subscription')} 
          onFreeRegister={() => {
            setLoginInRegisterMode(true);
            setAppState('login');
          }}
          t={t} 
          lang={systemLang} 
          setLang={setSystemLang} 
          onPrivacy={() => setAppState('privacy')} 
          onTerms={() => setAppState('terms')} 
          onAbout={() => setAppState('about-atrioswork')} 
        />
      )}
      {appState === 'privacy' && <PrivacyPage onBack={() => setAppState('landing')} />}
      {appState === 'terms' && <TermsPage onBack={() => setAppState('landing')} />}
      {appState === 'subscription' && <SubscriptionPage onSuccess={() => setAppState('login')} onBack={() => setAppState(user.id ? 'dashboard' : 'landing')} t={t} />}
      {appState === 'login' && (
        <LoginPage 
          onLogin={() => {}} 
          onBack={() => setAppState('landing')} 
          t={t} 
          externalError={authError} 
          initialRegisterMode={loginInRegisterMode}
        />
      )}
      {appState === 'about-atrioswork' && <AboutAtriosWorkPage onBack={() => setAppState(user.id ? 'dashboard' : 'landing')} />}
      
      {user.id && <PublicSupportChat />}

      {['dashboard', 'finance', 'part-time', 'reports', 'accountant', 'settings', 'admin', 'vendor-detail', 'vendor-sales', 'support', 'user-support'].includes(appState) && (
        <div className="flex h-screen overflow-hidden relative">
          <Sidebar activeTab={appState} setActiveTab={handleTabChange} user={user} onLogout={handleLogout} t={t} hideValues={hideValues} togglePrivacy={() => setHideValues(!hideValues)} isPro={isPro} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-12 pt-6 md:pt-12 pb-40 md:pb-12 ml-0 md:ml-24 scroll-smooth">
            <div className="max-w-5xl mx-auto w-full">
              {appState === 'dashboard' && <Dashboard user={user} records={records} onOpenPremium={() => setIsPremiumModalOpen(true)} onDeleteRecord={async (date) => {
                if (!user.id) return false;
                const { error } = await supabase.from('work_records').delete().eq('user_id', user.id).eq('date', date);
                if (error) return false;
                setRecords(prev => {
                  const copy = { ...prev };
                  delete copy[date];
                  return copy;
                });
                return true;
              }} onAddRecord={async (r) => {
                if (!user.id) return false;

                // Limite de 4 vales (adiantamentos) por mês para free
                if (!isPro && r.advance > 0) {
                  const rDate = new Date(r.date);
                  const currentMonth = rDate.getMonth();
                  const currentYear = rDate.getFullYear();
                  
                  const monthlyAdvances = Object.values(records).filter(rec => {
                    const recDate = new Date(rec.date);
                    return rec.advance > 0 && 
                           recDate.getMonth() === currentMonth && 
                           recDate.getFullYear() === currentYear &&
                           rec.date !== r.date; // Não contar o próprio dia se for um update
                  });

                  if (monthlyAdvances.length >= 4 && (!records[r.date] || records[r.date].advance === 0)) {
                    alert("Limite de 4 vales mensais atingido na versão gratuita. Atualize para o plano PRO para inserir vales ilimitados.");
                    return false;
                  }
                }

                const { error } = await supabase.from('work_records').upsert({ user_id: user.id, date: r.date, data: r }, { onConflict: 'user_id,date' });
                if (error) return false;
                setRecords(prev => ({ ...prev, [r.date]: r }));
                return true;
              }} t={t} hideValues={hideValues} isPro={isPro} />}
              {appState === 'finance' && <FinancePage user={user} records={records} t={t} f={formatCurrency} isPro={isPro} />}
              {appState === 'part-time' && (
                <PartTimePage 
                  user={user} 
                  records={records} 
                  t={t} 
                  f={formatCurrency} 
                  isPro={isPro} 
                  onOpenPremium={() => setIsPremiumModalOpen(true)}
                  onAddRecord={async (r) => {
                    if (!user.id) return false;
                    
                    const totalPartTimes = Object.values(records).filter(rec => 
                      (rec.partTimeHours && rec.partTimeHours > 0) || 
                      (rec.partTimeServiceValue && rec.partTimeServiceValue > 0) ||
                      rec.partTimeServiceDesc ||
                      rec.partTimeNotes
                    ).length;

                    const isExistent = records[r.date] && (
                      (records[r.date].partTimeHours && records[r.date].partTimeHours > 0) ||
                      (records[r.date].partTimeServiceValue && records[r.date].partTimeServiceValue > 0) ||
                      records[r.date].partTimeServiceDesc ||
                      records[r.date].partTimeNotes
                    );

                    if (!isPro && totalPartTimes >= 5 && !isExistent) {
                      alert("Limite de 5 lançamentos de Part-time atingido na versão gratuita. Ative a sua licença PRO para continuar a registar novos dias.");
                      return false;
                    }

                    const { error } = await supabase.from('work_records').upsert({ user_id: user.id, date: r.date, data: r }, { onConflict: 'user_id,date' });
                    if (error) return false;
                    setRecords(prev => ({ ...prev, [r.date]: r }));
                    return true;
                  }} 
                />
              )}
              {appState === 'reports' && <ReportsPage user={user} records={records} t={t} f={formatCurrency} isPro={isPro} />}
              {appState === 'accountant' && <AccountantPage user={user} records={records} t={t} f={formatCurrency} isPro={isPro} />}
              {appState === 'settings' && <SettingsPage user={user} setUser={async (updatedUser) => {
                if (!user.id) return false;
                const { id, email, created_at, ...updateData } = updatedUser;
                const { error } = await supabase.from('profiles').update(updateData).eq('id', user.id);
                if (error) return false;
                setUser(updatedUser);
                return true;
              }} t={t} hideValues={hideValues} isPro={isPro} />}
              {appState === 'admin' && (
                <AdminPage 
                  currentUser={user} 
                  f={formatCurrency} 
                  onLogout={handleLogout} 
                  t={t} 
                  onUpdateProfile={async (u) => { 
                    const { id, email, created_at, ...data } = u; 
                    const { error } = await supabase.from('profiles').update(data).eq('id', u.id); 
                    if (error) return false; 
                    return true; 
                  }} 
                  hideValues={hideValues}
                  onViewVendor={(id) => {
                    setSelectedVendorData(id);
                    setAppState('vendor-detail');
                  }}
                  onViewVendorSales={(vendor) => {
                    setAdminOverrideVendor(vendor);
                    setAppState('vendor-sales');
                  }}
                />
              )}
              {appState === 'vendor-detail' && <VendorDetailPage vendorId={selectedVendorData || user.id!} currentUser={user} onBack={() => { setSelectedVendorData(null); setAppState('admin'); }} f={formatCurrency} isVendorSelf={!selectedVendorData} />}
              {appState === 'vendor-sales' && <VendorSalesPage user={user} adminOverrideVendor={adminOverrideVendor} onBackToAdmin={() => { setAdminOverrideVendor(null); setAppState('admin'); }} />}
              {appState === 'support' && <SupportPage user={user} f={formatCurrency} t={t} />}
              {appState === 'user-support' && <UserSupportPage user={user} t={t} />}
            </div>
          </main>
        </div>
      )}
    </div>
  );
};

export default App;