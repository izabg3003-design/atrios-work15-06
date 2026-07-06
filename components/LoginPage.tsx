
import React, { useState, useEffect } from 'react';
import { User, Lock, ArrowRight, ArrowLeft, ShieldAlert, Loader2, ShieldCheck, UserPlus, Phone, Mail, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../lib/pushSender';

interface Props {
  onLogin: (email: string) => void;
  onBack: () => void;
  t: (key: string) => any;
  externalError?: { title: string, text: string } | null;
  initialRegisterMode?: boolean;
}

const LoginPage: React.FC<Props> = ({ onLogin, onBack, t, externalError, initialRegisterMode = false }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<{ title: string, text: string } | null>(null);
  const [isRegistering, setIsRegistering] = useState(initialRegisterMode);
  
  const [regData, setRegData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (externalError) {
      setErrorMsg(externalError);
    }
  }, [externalError]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          setErrorMsg({
            title: t('login.blockedTitle'),
            text: t('login.blockedMsg')
          });
          return;
        } else if (error.message.includes('Invalid login credentials')) {
          setErrorMsg({
            title: t('login.invalidTitle'),
            text: t('login.invalidMsg')
          });
          return;
        }
        throw error;
      }

      onLogin(email);
    } catch (error: any) {
      setErrorMsg({
        title: t('login.systemError'),
        text: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regData.password !== regData.confirmPassword) {
      setErrorMsg({ title: 'ERRO DE SENHA', text: 'As senhas não coincidem!' });
      return;
    }
    
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: regData.email,
        password: regData.password,
        options: { 
          data: { 
            full_name: regData.name, 
            phone: regData.phone
          } 
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          name: regData.name,
          email: regData.email,
          phone: regData.phone,
          role: 'user',
          hourlyRate: 10,
          isFreelancer: false,
          subscription: {
            id: `FREE-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            startDate: new Date().toISOString(), 
            isActive: true,
            status: 'ACTIVE_FREE'
          }
        });

        if (profileError) throw profileError;
        
        // Log notification in history (app_banners) and trigger push
        try {
          await supabase.from('app_banners').insert([{
            title: `[PUSH] Novo Cadastro: ${regData.name}`,
            highlight: `O utilizador ${regData.name} (${regData.email}) acabou de se cadastrar no AtriosWork.`,
            subtitle: 'Notificação de Sistema',
            cta_text: 'Ver Painel',
            cta_link: '/',
            theme_color: 'emerald',
            is_active: true,
            user_type: 'push_notification'
          }]);
        } catch (dbErr) {
          console.error('Erro ao registrar push no histórico:', dbErr);
        }
        
        // Trigger push notification to admins about the new user registration
        try {
          await sendPushNotification({
            title: '🆕 Novo Cadastro no App!',
            body: `O utilizador ${regData.name} (${regData.email}) acabou de se cadastrar no AtriosWork.`,
            audience: 'admin'
          });
          
          // Redundância Supabase Edge Functions se configurado
          await supabase.functions.invoke('send-fcm-push', {
            body: {
              title: '🆕 Novo Cadastro no App!',
              body: `O utilizador ${regData.name} (${regData.email}) acabou de se cadastrar no AtriosWork.`,
              audience: 'admin'
            }
          }).catch(() => {});
        } catch (fcmErr) {
          console.warn('Erro ao disparar push de novo cadastro:', fcmErr);
        }
        
        onLogin(regData.email);
      }
    } catch (error: any) {
      setErrorMsg({
        title: 'ERRO NO REGISTO',
        text: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] animate-pulse"></div>

      <div className="max-w-md w-full bg-slate-900/40 backdrop-blur-2xl border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden">
        
        {/* Top Header with Back Button */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={isRegistering ? () => setIsRegistering(false) : onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-white transition-all group bg-slate-800/30 px-4 py-2 rounded-xl border border-slate-700/50"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">{t('common.back')}</span>
          </button>
          
          <div className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full">
            <span className="text-[9px] font-black text-purple-400 uppercase tracking-[0.2em]">{isRegistering ? 'REGISTO GRATUITO' : t('login.secureAccess')}</span>
          </div>
        </div>

        <div className="text-center mb-10">
          <h2 className="text-4xl font-black italic text-white tracking-tighter">ATRIOS<span className="text-purple-400">WORK</span></h2>
          <p className="text-slate-500 mt-2 text-[10px] font-black uppercase tracking-[0.3em]">{isRegistering ? 'CRIE A SUA CONTA AGORA' : t('login.platformNote')}</p>
        </div>

        {errorMsg && (
          <div className={`mb-8 p-5 rounded-[1.5rem] space-y-1 animate-[shake_0.5s_ease-in-out] border ${
            errorMsg.title.includes('BLOQUEADO') || errorMsg.title.includes('SUSPENSO') || errorMsg.title.includes('BLOCKED') 
              ? 'bg-orange-500/10 border-orange-500/30' 
              : (errorMsg.title.includes('BEM-VINDO') || errorMsg.title.includes('SUCESSO') || errorMsg.title.includes('SUCCESS')
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-red-500/10 border-red-500/20')
          }`}>
            <div className={`flex items-center gap-2 mb-1 ${
              errorMsg.title.includes('BLOQUEADO') || errorMsg.title.includes('SUSPENSO') || errorMsg.title.includes('BLOCKED') 
                ? 'text-orange-500' 
                : (errorMsg.title.includes('BEM-VINDO') || errorMsg.title.includes('SUCESSO') || errorMsg.title.includes('SUCCESS')
                  ? 'text-emerald-500'
                  : 'text-red-500')
            }`}>
              {errorMsg.title.includes('BEM-VINDO') || errorMsg.title.includes('SUCESSO') || errorMsg.title.includes('SUCCESS') ? (
                <ShieldCheck className="w-4 h-4 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0" />
              )}
              <p className="text-[10px] font-black uppercase tracking-widest">{errorMsg.title}</p>
            </div>
            <p className={`text-[11px] font-bold leading-relaxed ${
              errorMsg.title.includes('BLOQUEADO') || errorMsg.title.includes('SUSPENSO') || errorMsg.title.includes('BLOCKED') 
                ? 'text-orange-400/80' 
                : (errorMsg.title.includes('BEM-VINDO') || errorMsg.title.includes('SUCESSO') || errorMsg.title.includes('SUCCESS')
                  ? 'text-emerald-400/80'
                  : 'text-red-400/80')
            }`}>{errorMsg.text}</p>
          </div>
        )}

        {!isRegistering ? (
          <>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('login.idAtriosWork')}</label>
                <div className="relative group">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                  <input 
                    type="email" 
                    required
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-14 pr-4 py-5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-white font-medium"
                    placeholder="user@atrioswork.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('login.securityKey')}</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                  <input 
                    type="password" 
                    required
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-14 pr-4 py-5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-white font-medium"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button 
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-purple-900/20 flex items-center justify-center space-x-3 group active:scale-[0.98] disabled:opacity-50 mt-8"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                  <>
                    <span className="uppercase tracking-[0.2em] text-sm">{t('login.validateAccess')}</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-800 space-y-4">
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] text-center">Ainda não tem conta?</p>
              <button 
                onClick={() => setIsRegistering(true)}
                className="w-full py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] text-slate-950 shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 btn-gold-shine"
              >
                <Sparkles className="w-4 h-4" />
                Começar Gratuitamente
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo</label>
              <div className="relative group">
                <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                <input 
                  type="text" 
                  required
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white text-sm"
                  placeholder="Seu Nome"
                  value={regData.name}
                  onChange={(e) => setRegData({...regData, name: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Email de Acesso</label>
              <div className="relative group">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                <input 
                  type="email" 
                  required
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white text-sm"
                  placeholder="email@exemplo.com"
                  value={regData.email}
                  onChange={(e) => setRegData({...regData, email: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Telemóvel</label>
              <div className="relative group">
                <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                <input 
                  type="tel" 
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white text-sm"
                  placeholder="+351..."
                  value={regData.phone}
                  onChange={(e) => setRegData({...regData, phone: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Senha</label>
                <input 
                  type="password" 
                  required
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white text-sm"
                  placeholder="••••••••"
                  value={regData.password}
                  onChange={(e) => setRegData({...regData, password: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Confirmar</label>
                <input 
                  type="password" 
                  required
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white text-sm"
                  placeholder="••••••••"
                  value={regData.confirmPassword}
                  onChange={(e) => setRegData({...regData, confirmPassword: e.target.value})}
                />
              </div>
            </div>

            <button 
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-emerald-900/20 flex items-center justify-center space-x-3 group active:scale-[0.98] disabled:opacity-50 mt-6"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span className="uppercase tracking-[0.2em] text-sm">Criar Conta Gratuita</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        @keyframes shine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .btn-gold-shine {
          background: linear-gradient(90deg, #d4af37, #f9f295, #d4af37, #f9f295, #d4af37);
          background-size: 200% auto;
          animation: shine 3s linear infinite;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .btn-gold-shine:hover {
          filter: brightness(1.1);
          transform: scale(1.02);
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
