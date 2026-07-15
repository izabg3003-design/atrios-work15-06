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
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import AboutAtriosWorkPage from './components/AboutAtriosWorkPage';
import PushNotificationManager from './components/PushNotificationManager';
import { InstallAppModal } from './components/InstallAppModal';
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
  settings: { language: 'pt-PT', currency: 'EUR' },
  companyName: '',
  companyLockStatus: 'unlocked'
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
  
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          (navigator as any).standalone === true;
    
    if (isStandalone) {
      console.log('Running as a PWA standalone app');
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallModalOpen(true);
    };

    const handleOpenPwaModal = () => {
      setIsInstallModalOpen(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('open-pwa-install-modal', handleOpenPwaModal);

    const timer = setTimeout(() => {
      const alreadyDismissed = sessionStorage.getItem('pwa_install_dismissed') === 'true';
      if (!alreadyDismissed) {
        setIsInstallModalOpen(true);
      }
    }, 4000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('open-pwa-install-modal', handleOpenPwaModal);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!user || !user.id || appState === 'landing' || appState === 'login') return;

    const updateActivity = async () => {
      try {
        const { data: latestProfile } = await supabase
          .from('profiles')
          .select('settings')
          .eq('id', user.id)
          .maybeSingle();

        const currentSettings = latestProfile?.settings || {};
        const updatedSettings = {
          ...currentSettings,
          last_seen_at: new Date().toISOString()
        };

        await supabase
          .from('profiles')
          .update({ settings: updatedSettings })
          .eq('id', user.id);
      } catch (err) {
        console.warn('Erro ao atualizar atividade periódica:', err);
      }
    };

    updateActivity();
    const interval = setInterval(updateActivity, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, appState]);
  
  const [now, setNow] = useState(new Date());
  const isInitialLoad = useRef(true);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isPro = useMemo(() => {
    const sub = typeof user.subscription === 'string' ? JSON.parse(user.subscription) : user.subscription;
    const isPaid = sub?.status === 'ACTIVE_PAID' || sub?.status === 'PRO' || user?.status === 'PRO' || user?.status === 'ACTIVE_PAID';
    const isMaster = user.email?.toLowerCase()?.includes('master@atrioswork.com') || user.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || user.email?.toLowerCase()?.includes('master@digitalnexus.com');
    const isAdmin = user.role === 'admin';
    
    if (isMaster || isAdmin) return true;
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
    // Balão da JivoChat sempre visível em todas as páginas
    document.body.classList.add('jivo-visible');

    const updateJivo = () => {
      try {
        const api = (window as any).jivo_api;
        if (api && typeof api.showWidget === 'function') {
          api.showWidget();
        }
      } catch (e) {}
    };

    updateJivo();
    const interval = setInterval(() => {
      if (!document.body.classList.contains('jivo-visible')) {
        document.body.classList.add('jivo-visible');
      }
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
        const parsedSub = typeof sub === 'string' ? JSON.parse(sub) : (sub || {});
        if (parsedSub.isActive === false && !profile.email?.toLowerCase()?.includes('master@atrioswork.com') && !profile.email?.toLowerCase()?.includes('izarellebraga@gmail.com') && !profile.email?.toLowerCase()?.includes('master@digitalnexus.com')) {
          await supabase.auth.signOut();
          setAuthError({ title: 'BEM-VINDO', text: 'Faça o login para aceder sua conta.' });
          setAppState('login');
          setAuthInitialized(true);
          return;
        }
        const currentSettings = profile.settings || {};
        const nowIso = new Date().toISOString();
        const lastSeen = currentSettings.last_seen_at;
        const shouldUpdate = !lastSeen || (new Date(nowIso).getTime() - new Date(lastSeen).getTime() > 2 * 60 * 1000);

        if (shouldUpdate) {
          const updatedSettings = {
            ...currentSettings,
            last_seen_at: nowIso
          };
          supabase.from('profiles').update({ settings: updatedSettings }).eq('id', userId).then(({ error }) => {
            if (error) console.warn("Erro ao atualizar last_seen_at:", error);
          });
          profile.settings = updatedSettings;
        }

        // Populate vacation properties from settings to keep the rest of the app working
        profile.isFirstYearAtCompany = profile.settings?.isFirstYearAtCompany ?? profile.isFirstYearAtCompany ?? false;
        profile.contractMonthsCompleted = profile.settings?.contractMonthsCompleted ?? profile.contractMonthsCompleted ?? 0;
        profile.companyName = profile.settings?.companyName ?? profile.companyName ?? '';
        profile.companyStartDate = profile.settings?.companyStartDate ?? profile.companyStartDate ?? undefined;
        profile.companyLockStatus = profile.settings?.companyLockStatus ?? profile.companyLockStatus ?? 'unlocked';

        setUser(profile);
        if (profile.email?.toLowerCase()?.includes('master@atrioswork.com') || profile.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || profile.email?.toLowerCase()?.includes('master@digitalnexus.com')) setAppState('admin');
        else if (profile.role === 'vendor') setAppState('vendor-detail');
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
    if (!user || !user.id || appState === 'landing' || appState === 'login') return;

    const updateActivity = async () => {
      try {
        const { data: latestProfile } = await supabase
          .from('profiles')
          .select('settings')
          .eq('id', user.id)
          .maybeSingle();

        const currentSettings = latestProfile?.settings || {};
        const updatedSettings = {
          ...currentSettings,
          last_seen_at: new Date().toISOString()
        };

        await supabase
          .from('profiles')
          .update({ settings: updatedSettings })
          .eq('id', user.id);
      } catch (err) {
        console.warn('Erro ao atualizar atividade periódica:', err);
      }
    };

    updateActivity();
    const interval = setInterval(updateActivity, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, appState]);

  // Real-time listener and polling for profile lock status and company name updates
  useEffect(() => {
    if (!user || !user.id || appState === 'landing' || appState === 'login') return;

    const fetchLatestProfile = async () => {
      try {
        const { data: latestProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (latestProfile) {
          const currentSettings = latestProfile.settings || {};
          const isFirstYear = currentSettings.isFirstYearAtCompany ?? latestProfile.isFirstYearAtCompany ?? false;
          const contractMonths = currentSettings.contractMonthsCompleted ?? latestProfile.contractMonthsCompleted ?? 0;
          const companyName = currentSettings.companyName ?? latestProfile.companyName ?? '';
          const companyLockStatus = currentSettings.companyLockStatus ?? latestProfile.companyLockStatus ?? 'unlocked';

          setUser((prev: any) => {
            if (!prev) return prev;

            const wasLocked = prev.companyLockStatus === 'locked' || prev.companyLockStatus === 'requested_unlock';
            const isNowUnlocked = companyLockStatus === 'unlocked';

            if (wasLocked && isNowUnlocked) {
              alert("A sua empresa foi desbloqueada para edição!");
            }

            if (
              prev.companyLockStatus !== companyLockStatus ||
              prev.companyName !== companyName ||
              prev.isFirstYearAtCompany !== isFirstYear ||
              prev.contractMonthsCompleted !== contractMonths ||
              JSON.stringify(prev.settings) !== JSON.stringify(currentSettings)
            ) {
              return {
                ...prev,
                ...latestProfile,
                isFirstYearAtCompany: isFirstYear,
                contractMonthsCompleted: contractMonths,
                companyName: companyName,
                companyLockStatus: companyLockStatus,
                settings: currentSettings
              };
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn("Erro ao obter perfil atualizado por polling:", err);
      }
    };

    // Poll every 8 seconds
    const interval = setInterval(fetchLatestProfile, 8000);

    // Also do realtime subscription
    let channel: any;
    try {
      channel = supabase
        .channel(`profile-updates-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          (payload: any) => {
            const updatedProfile = payload.new;
            if (updatedProfile) {
              const currentSettings = updatedProfile.settings || {};
              const isFirstYear = currentSettings.isFirstYearAtCompany ?? updatedProfile.isFirstYearAtCompany ?? false;
              const contractMonths = currentSettings.contractMonthsCompleted ?? updatedProfile.contractMonthsCompleted ?? 0;
              const companyName = currentSettings.companyName ?? updatedProfile.companyName ?? '';
              const companyLockStatus = currentSettings.companyLockStatus ?? updatedProfile.companyLockStatus ?? 'unlocked';

              setUser((prev: any) => {
                if (!prev) return prev;

                const wasLocked = prev.companyLockStatus === 'locked' || prev.companyLockStatus === 'requested_unlock';
                const isNowUnlocked = companyLockStatus === 'unlocked';

                if (wasLocked && isNowUnlocked) {
                  alert("A sua empresa foi desbloqueada para edição!");
                }

                return {
                  ...prev,
                  ...updatedProfile,
                  isFirstYearAtCompany: isFirstYear,
                  contractMonthsCompleted: contractMonths,
                  companyName: companyName,
                  companyLockStatus: companyLockStatus,
                  settings: currentSettings
                };
              });
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("Erro ao iniciar canal realtime:", err);
    }

    return () => {
      clearInterval(interval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.id, appState]);

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
      } catch (err: any) {
        console.error("Auth initialization failed directly (Failed to Fetch):", err);
        setAuthError({
          title: "ERRO DE LIGAÇÃO",
          text: "Não foi possível estabelecer ligação ao banco de dados (Failed to Fetch). Verifique a sua ligação à Internet ou se o seu projeto Supabase está ativo. Se for o administrador do projeto, certifique-se de que a sua instância está ativa no painel do Supabase, ou configure as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ligar à sua própria base de dados."
        });
        setAppState('login');
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
      <InstallAppModal 
        isOpen={isInstallModalOpen}
        onClose={() => {
          setIsInstallModalOpen(false);
          sessionStorage.setItem('pwa_install_dismissed', 'true');
        }}
        deferredPrompt={deferredPrompt}
        setDeferredPrompt={setDeferredPrompt}
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
      {appState === 'subscription' && <SubscriptionPage currentUser={user} onSuccess={() => setAppState('login')} onBack={() => setAppState(user.id ? 'dashboard' : 'landing')} t={t} />}
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
      
      {user.id && <PushNotificationManager user={user} />}

      {['dashboard', 'finance', 'part-time', 'reports', 'accountant', 'settings', 'admin', 'vendor-detail', 'vendor-sales'].includes(appState) && (
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
                
                // Limite de 165 horas para free
                if (!isPro && totalHours >= 165 && !records[r.date]) {
                  alert("Limite de 165 horas atingido na versão gratuita. Ative a sua licença PRO para continuar a registar.");
                  return false;
                }

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

                const { error } = await supabase.from('work_records').upsert({ 
                   user_id: user.id, 
                   user_email: user.email,
                   user_name: user.name,
                   date: r.date, 
                   data: r 
                 }, { onConflict: 'user_id,date' });
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

                    const { error } = await supabase.from('work_records').upsert({ 
                   user_id: user.id, 
                   user_email: user.email,
                   user_name: user.name,
                   date: r.date, 
                   data: r 
                 }, { onConflict: 'user_id,date' });
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
                const settingsWithVacation = {
                  ...(updatedUser.settings || {}),
                  isFirstYearAtCompany: updatedUser.isFirstYearAtCompany,
                  contractMonthsCompleted: updatedUser.contractMonthsCompleted,
                  companyName: updatedUser.companyName,
                  companyStartDate: updatedUser.companyStartDate,
                  companyLockStatus: updatedUser.companyLockStatus,
                  companyNif: updatedUser.companyNif,
                  password: updatedUser.password
                };
                const finalUpdatedUser = {
                  ...updatedUser,
                  settings: settingsWithVacation
                };
                const { id, created_at, ...updateData } = finalUpdatedUser;
                delete (updateData as any).isFirstYearAtCompany;
                delete (updateData as any).contractMonthsCompleted;
                delete (updateData as any).companyName;
                delete (updateData as any).companyStartDate;
                delete (updateData as any).companyLockStatus;
                delete (updateData as any).companyNif;
                delete (updateData as any).password;
                const { error } = await supabase.from('profiles').update(updateData).eq('id', user.id);
                if (error) return false;
                setUser(finalUpdatedUser);
                return true;
              }} t={t} hideValues={hideValues} isPro={isPro} />}
              {appState === 'admin' && (
                <AdminPage 
                  currentUser={user} 
                  f={formatCurrency} 
                  onLogout={handleLogout} 
                  t={t} 
                  onUpdateProfile={async (u) => { 
                    const settingsWithVacation = {
                      ...(u.settings || {}),
                      isFirstYearAtCompany: u.isFirstYearAtCompany,
                      contractMonthsCompleted: u.contractMonthsCompleted,
                      companyName: u.companyName,
                      companyStartDate: u.companyStartDate,
                      companyLockStatus: u.companyLockStatus,
                      companyNif: u.companyNif,
                      password: u.password
                    };
                    const finalU = {
                      ...u,
                      settings: settingsWithVacation
                    };
                    const { id, created_at, ...data } = finalU; 
                    delete (data as any).isFirstYearAtCompany;
                    delete (data as any).contractMonthsCompleted;
                    delete (data as any).companyName;
                    delete (data as any).companyStartDate;
                    delete (data as any).companyLockStatus;
                    delete (data as any).companyNif;
                    delete (data as any).password;
                    const { error } = await supabase.from('profiles').update(data).eq('id', u.id); 
                    if (error) {
                      console.error('[Admin Update Profile Error]:', error);
                      return false; 
                    }
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
            </div>
          </main>
        </div>
      )}
    </div>
  );
};

export default App;