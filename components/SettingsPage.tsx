
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, Save, User as UserIcon, Clock, ShieldAlert, Percent, Euro, Loader2, CheckCircle, Phone, Hash, Fingerprint, Star, ReceiptText, Info, Lock, ShieldCheck, Crown, Zap, Tag, ToggleLeft, ToggleRight, Coins, Smartphone, Sparkles, Bell, BellRing, RefreshCw, AlertTriangle, Send } from 'lucide-react';
import { UserProfile, Language, Currency } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  user: UserProfile;
  setUser: (newProfile: UserProfile) => Promise<boolean>;
  t: (key: string) => any;
  hideValues?: boolean;
  isPro?: boolean;
}

const SettingsPage: React.FC<Props> = ({ user, setUser, t, hideValues, isPro }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMaster = user.email?.toLowerCase()?.includes('master@atrioswork.com') || user.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || user.email?.toLowerCase()?.includes('master@digitalnexus.com');
  const [formUser, setFormUser] = useState<UserProfile>(() => ({
    ...user,
    overtimeRates: user.overtimeRates || { h1: 50, h2: 75, h3: 100 }
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [passwords, setPasswords] = useState({ new: '', confirm: '' });
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);
  const [passUpdateSuccess, setPassUpdateSuccess] = useState(false);

  // Estado para diagnóstico e controlo de notificações push
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [hasPushToken, setHasPushToken] = useState(false);
  const [pushDetails, setPushDetails] = useState<any>(null);
  const [isSyncingPush, setIsSyncingPush] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [isTestingSystemPush, setIsTestingSystemPush] = useState(false);
  const [pushStatusMsg, setPushStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
      
      // Verificar se existe assinatura ativa localmente
      if (navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(async (reg) => {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            setHasPushToken(true);
            setPushDetails(sub.toJSON());
          }
        }).catch((err) => {
          console.warn('Erro ao obter subscrição inicial:', err);
        });
      }
    }
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const handleForceSyncPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('O seu navegador não suporta Service Worker ou Push Notifications.');
      return;
    }
    setIsSyncingPush(true);
    setPushStatusMsg('A obter chave de segurança e a registar...');
    try {
      const reg = await navigator.serviceWorker.ready;
      
      // Obter chave pública VAPID do servidor
      let publicKey = "BJn7k0YuZBjidryzlMNfT4Rpo7MtnglZIiFJ-fRcwR6qwYx-OsSIXHIK4Wjws44ZO6uMh0w21KHfr_iUaauvvO4";
      try {
        const keyRes = await fetch('/api/push/public-key');
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          if (keyData?.publicKey) publicKey = keyData.publicKey;
        }
      } catch (e) {
        console.warn('Erro ao obter chave pública:', e);
      }

      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        const currentKeyBuffer = sub.options.applicationServerKey;
        const serverKeyBuffer = urlBase64ToUint8Array(publicKey);
        let keysMatch = false;
        if (currentKeyBuffer) {
          const currentKeyArray = new Uint8Array(currentKeyBuffer);
          keysMatch = currentKeyArray.length === serverKeyBuffer.length &&
                      currentKeyArray.every((val, i) => val === serverKeyBuffer[i]);
        }
        if (!keysMatch) {
          await sub.unsubscribe();
          sub = null;
        }
      }

      if (!sub) {
        const convertedKey = urlBase64ToUint8Array(publicKey);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey
        });
      }

      const vapidSub = sub.toJSON();
      setPushDetails(vapidSub);
      setHasPushToken(true);

      // Persistir no backend
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: vapidSub,
          userId: user.id,
          email: user.email,
          role: user.role
        })
      });

      if (response.ok) {
        setPushStatusMsg('Dispositivo sincronizado e registado com sucesso!');
      } else {
        setPushStatusMsg('Erro ao guardar assinatura no servidor.');
      }
    } catch (err: any) {
      console.error(err);
      setPushStatusMsg(`Falha na sincronização: ${err.message || err}`);
    } finally {
      setIsSyncingPush(false);
    }
  };

  const handleRequestPushPermission = async () => {
    if (!('Notification' in window)) {
      alert('As notificações não são suportadas neste navegador.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm === 'granted') {
        setPushStatusMsg('Permissão concedida! Sincronizando dispositivo...');
        await handleForceSyncPush();
      } else if (perm === 'denied') {
        setPushStatusMsg('Permissão bloqueada pelo navegador. Ative nas configurações do seu navegador.');
      }
    } catch (err: any) {
      alert(`Erro ao pedir permissão: ${err.message}`);
    }
  };

  const handleTestPush = async () => {
    setIsTestingPush(true);
    setPushStatusMsg('A enviar notificação de teste pessoal...');
    try {
      const res = await fetch('/api/send-fcm-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🔔 Teste de Notificação AtriosWork',
          body: 'As suas notificações de sistema pessoais estão ativas e a funcionar perfeitamente!',
          targetUserEmail: user.email,
          url: '/'
        })
      });
      if (res.ok) {
        setPushStatusMsg('Notificação enviada com sucesso! Verifique se recebeu no seu ecrã.');
      } else {
        const text = await res.text();
        setPushStatusMsg(`Erro ao enviar teste: ${text || res.statusText}`);
      }
    } catch (err: any) {
      setPushStatusMsg(`Falha no envio de teste: ${err.message}`);
    } finally {
      setIsTestingPush(false);
    }
  };

  const handleTestSystemPush = async () => {
    setIsTestingSystemPush(true);
    setPushStatusMsg('A enviar notificação de teste de sistema (Admins)...');
    try {
      const res = await fetch('/api/send-fcm-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🆕 Teste: Novo Cadastro no App!',
          body: `O utilizador de teste registou-se no sistema às ${new Date().toLocaleTimeString('pt-PT')}.`,
          audience: 'admin',
          url: '/'
        })
      });
      if (res.ok) {
        setPushStatusMsg('Disparo de teste de sistema concluído para todos os administradores!');
      } else {
        const text = await res.text();
        setPushStatusMsg(`Erro ao enviar teste de sistema: ${text || res.statusText}`);
      }
    } catch (err: any) {
      setPushStatusMsg(`Falha no envio do teste de sistema: ${err.message}`);
    } finally {
      setIsTestingSystemPush(false);
    }
  };

  useEffect(() => { 
    setFormUser({
      ...user,
      overtimeRates: user.overtimeRates || { h1: 50, h2: 75, h3: 100 }
    }); 
  }, [user]);

  const getAtriosWorkId = () => {
    if (hideValues) return "••••••••";
    try {
      const sub = typeof user.subscription === 'string' ? JSON.parse(user.subscription) : (user.subscription || {});
      return sub.id || user.id?.substring(0, 8) || '---';
    } catch (e) { return user.id?.substring(0, 8) || '---'; }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const success = await setUser(formUser);
      if (success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        throw new Error("Cloud Sync Failed");
      }
    } catch (error: any) {
      alert(`Error syncing: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwords.new) { alert("Senha vazia."); return; }
    if (passwords.new !== passwords.confirm) { alert("Senhas não coincidem."); return; }
    if (passwords.new.length < 6) { alert("Mínimo 6 caracteres."); return; }

    setIsUpdatingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwords.new });
      if (error) throw error;
      setPassUpdateSuccess(true);
      setPasswords({ new: '', confirm: '' });
      setTimeout(() => setPassUpdateSuccess(false), 4000);
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setIsUpdatingPass(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-[fadeIn_0.5s_ease-out] pb-40">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">AtriosWork Identity</span>
          </div>
          <h2 className="text-4xl font-black italic tracking-tighter text-white uppercase">{t('settings.title').split(' ')[0]} <span className="text-purple-400">{t('settings.title').split(' ').slice(1).join(' ')}</span></h2>
        </div>
        <button onClick={handleSave} disabled={isSaving} className={`flex items-center justify-center space-x-3 font-black px-10 py-5 rounded-2xl transition-all shadow-2xl ${saveSuccess ? 'bg-green-500 text-white' : 'bg-green-600 hover:bg-green-500 text-slate-900'}`}>
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : saveSuccess ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
          <span className="text-xs uppercase tracking-widest">{isSaving ? t('settings.saving') : saveSuccess ? t('settings.saved') : t('settings.saveBtn')}</span>
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="space-y-6">
           <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] flex flex-col items-center text-center shadow-xl">
              <div className="relative mb-6">
                <div className={`w-32 h-32 rounded-3xl overflow-hidden border-4 ${isMaster ? 'border-amber-500' : 'border-slate-800'} bg-slate-950 flex items-center justify-center`}>
                  {formUser.photo ? <img src={formUser.photo} className="w-full h-full object-cover" alt="Profile" /> : <UserIcon className={`w-16 h-16 ${isMaster ? 'text-amber-500' : 'text-slate-800'}`} />}
                </div>
                <button onClick={() => fileInputRef.current?.click()} className={`absolute -bottom-2 -right-2 ${isMaster ? 'bg-amber-600' : 'bg-purple-600'} p-3 rounded-2xl border-4 border-slate-900`}><Camera className="w-5 h-5 text-white" /></button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if(file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setFormUser(p => ({...p, photo: reader.result as string}));
                    reader.readAsDataURL(file);
                  }
                }} />
              </div>
              <h3 className="text-xl font-black text-white italic tracking-tight uppercase flex items-center gap-2">{isMaster && <Crown className="w-4 h-4 text-amber-500" />}{formUser.name}</h3>
              <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest mt-1">#{getAtriosWorkId()}</p>
           </div>

           {/* Painel Fiscal / IVA */}
           <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ReceiptText className="w-5 h-5 text-emerald-400" />
                  <h4 className="text-xs font-black text-white uppercase italic tracking-tighter">Regime IVA</h4>
                </div>
                <button 
                  onClick={() => setFormUser(p => ({ ...p, isFreelancer: !p.isFreelancer }))}
                  className={`transition-all duration-300 ${formUser.isFreelancer ? 'text-emerald-500' : 'text-slate-600'}`}
                >
                  {formUser.isFreelancer ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                </button>
              </div>

              <div className={`space-y-4 transition-all duration-500 ${formUser.isFreelancer ? 'opacity-100 translate-y-0' : 'opacity-20 pointer-events-none translate-y-2'}`}>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest ml-1">Valor do IVA %</label>
                  <div className="relative">
                    <Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
                    <input 
                      type={hideValues ? "password" : "number"} 
                      step="0.1" 
                      value={formUser.vat.value} 
                      onChange={e => setFormUser(p => ({ ...p, vat: { ...p.vat, value: Number(e.target.value) } }))}
                      className="w-full bg-slate-950 border border-emerald-500/20 rounded-xl pl-12 pr-4 py-3 text-white font-black text-sm outline-none focus:ring-1 focus:ring-emerald-500/50" 
                      placeholder="23"
                    />
                  </div>
                </div>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                  Com o modo IVA ativo, o sistema calculará automaticamente o imposto sobre o bruto faturado.
                </p>
              </div>
           </div>
        </div>

        <div className="md:col-span-2 space-y-8">
          {/* 1. DADOS PESSOAIS */}
          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl">
            <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3"><Hash className="w-5 h-5 text-purple-400" />{t('settings.idAndContact')}</h4>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.displayName')}</label><input type="text" value={formUser.name} onChange={(e) => setFormUser(p => ({ ...p, name: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.taxId')}</label><input type="text" value={formUser.nif || ''} onChange={(e) => setFormUser(p => ({ ...p, nif: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.phone')}</label><input type="tel" value={formUser.phone || ''} onChange={(e) => setFormUser(p => ({ ...p, phone: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
            </div>
          </div>

          {/* 2. HORÁRIO BASE */}
          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl">
            <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3"><Clock className="w-5 h-5 text-green-400" />{t('settings.standardHours')}</h4>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.defaultEntry')}</label><input type="time" value={formUser.defaultEntry} onChange={(e) => setFormUser(p => ({ ...p, defaultEntry: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.defaultExit')}</label><input type="time" value={formUser.defaultExit} onChange={(e) => setFormUser(p => ({ ...p, defaultExit: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.hourlyRate')}</label>
              <div className="relative">
                <Euro className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-400" />
                <input 
                  type={hideValues ? "password" : "number"} 
                  step="0.01" 
                  value={formUser.hourlyRate} 
                  onChange={e => setFormUser(p => ({ ...p, hourlyRate: Number(e.target.value) }))}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-green-500/50" 
                />
              </div>
            </div>
          </div>

          {/* 3. CONFIGURAÇÃO DE HORAS EXTRAS */}
          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl relative overflow-hidden">
            <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3"><Zap className="w-5 h-5 text-purple-400" />Configuração de Horas Extras</h4>
            <div className={`grid md:grid-cols-3 gap-6 ${!isPro ? 'blur-md select-none pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">1° Hora Extra (%)</label>
                <div className="relative">
                  <Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" />
                  <input 
                    type={hideValues ? "password" : "number"} 
                    value={formUser.overtimeRates.h1} 
                    onChange={e => setFormUser(p => ({ ...p, overtimeRates: { ...p.overtimeRates, h1: Number(e.target.value) } }))}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500/50" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">2° Hora Extra (%)</label>
                <div className="relative">
                  <Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" />
                  <input 
                    type={hideValues ? "password" : "number"} 
                    value={formUser.overtimeRates.h2} 
                    onChange={e => setFormUser(p => ({ ...p, overtimeRates: { ...p.overtimeRates, h2: Number(e.target.value) } }))}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500/50" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">3° Hora Extra (%)</label>
                <div className="relative">
                  <Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" />
                  <input 
                    type={hideValues ? "password" : "number"} 
                    value={formUser.overtimeRates.h3} 
                    onChange={e => setFormUser(p => ({ ...p, overtimeRates: { ...p.overtimeRates, h3: Number(e.target.value) } }))}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500/50" 
                  />
                </div>
              </div>
            </div>
            {!isPro && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] z-10">
                <div className="bg-amber-500/20 border border-amber-500/30 px-6 py-3 rounded-2xl flex items-center gap-3">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <span className="text-xs font-black text-amber-500 uppercase tracking-[0.2em]">AtriosWork PRO Required</span>
                </div>
              </div>
            )}
          </div>

          {/* 4. RETENÇÕES FISCAIS PERSONALIZADAS */}
          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-8 shadow-xl">
             <div className="flex items-center gap-3">
               <Coins className="w-5 h-5 text-amber-500" />
               <h4 className="text-sm font-black text-white uppercase tracking-widest">Retenções Fiscais Personalizadas</h4>
             </div>

             <div className="grid md:grid-cols-2 gap-8">
                {/* BLOCO IRS */}
                <div className="space-y-4 p-6 bg-slate-950/50 rounded-3xl border border-white/5">
                   <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                         <ShieldAlert className="w-4 h-4 text-rose-500" />
                         <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Retenção IRS</span>
                      </div>
                      <div className="flex p-1 bg-slate-900 rounded-lg border border-white/5">
                         <button 
                           onClick={() => setFormUser(p => ({ ...p, irs: { ...p.irs, type: 'percentage' } }))}
                           className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${formUser.irs.type === 'percentage' ? 'bg-rose-600 text-white' : 'text-slate-500'}`}
                         >
                           %
                         </button>
                         <button 
                           onClick={() => setFormUser(p => ({ ...p, irs: { ...p.irs, type: 'fixed' } }))}
                           className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${formUser.irs.type === 'fixed' ? 'bg-rose-600 text-white' : 'text-slate-500'}`}
                         >
                           €
                         </button>
                      </div>
                   </div>
                   <div className="relative">
                      {formUser.irs.type === 'percentage' ? (
                        <Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500/50" />
                      ) : (
                        <Euro className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500/50" />
                      )}
                      <input 
                        type={hideValues ? "password" : "number"} 
                        step="0.01"
                        value={formUser.irs.value} 
                        onChange={e => setFormUser(p => ({ ...p, irs: { ...p.irs, value: Number(e.target.value) } }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-rose-500/50"
                        placeholder="Valor..."
                      />
                   </div>
                </div>

                {/* BLOCO SEGURANÇA SOCIAL */}
                <div className="space-y-4 p-6 bg-slate-950/50 rounded-3xl border border-white/5">
                   <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                         <ShieldCheck className="w-4 h-4 text-blue-500" />
                         <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Segurança Social</span>
                      </div>
                      <div className="flex p-1 bg-slate-900 rounded-lg border border-white/5">
                         <button 
                           onClick={() => setFormUser(p => ({ ...p, socialSecurity: { ...p.socialSecurity, type: 'percentage' } }))}
                           className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${formUser.socialSecurity.type === 'percentage' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                         >
                           %
                         </button>
                         <button 
                           onClick={() => setFormUser(p => ({ ...p, socialSecurity: { ...p.socialSecurity, type: 'fixed' } }))}
                           className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${formUser.socialSecurity.type === 'fixed' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                         >
                           €
                         </button>
                      </div>
                   </div>
                   <div className="relative">
                      {formUser.socialSecurity.type === 'percentage' ? (
                        <Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500/50" />
                      ) : (
                        <Euro className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500/50" />
                      )}
                      <input 
                        type={hideValues ? "password" : "number"} 
                        step="0.01"
                        value={formUser.socialSecurity.value} 
                        onChange={e => setFormUser(p => ({ ...p, socialSecurity: { ...p.socialSecurity, value: Number(e.target.value) } }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-blue-500/50"
                        placeholder="Valor..."
                      />
                   </div>
                </div>
             </div>
          </div>

          {/* SEGURANÇA (FINAL DA COLUNA) */}
          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl">
            <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3"><ShieldCheck className="w-5 h-5 text-purple-400" />{t('settings.security.title')}</h4>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.security.newPassword')}</label><input type="password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.security.confirmPassword')}</label><input type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
            </div>
            <button onClick={handleUpdatePassword} disabled={isUpdatingPass} className="w-full py-4 rounded-xl bg-slate-950 border border-slate-800 text-purple-400 font-black uppercase text-[10px] tracking-widest hover:bg-purple-600 hover:text-white transition-all">{isUpdatingPass ? 'PROCESSANDO...' : 'ATUALIZAR SEGURANÇA'}</button>
          </div>

          {/* DIAGNÓSTICO E CONFIGURAÇÃO DE NOTIFICAÇÕES PUSH */}
          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-blue-400" />
              <h4 className="text-sm font-black text-white uppercase tracking-widest">Estado das Notificações do Sistema</h4>
            </div>

            <p className="text-[10px] text-slate-400 font-bold uppercase leading-normal">
              Se as notificações de novos utilizadores ou de chat de suporte não estiverem a chegar, verifique as permissões do seu navegador e teste a receção em tempo real abaixo.
            </p>

            {/* Painel de Indicadores */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Indicador de Permissão do Navegador */}
              <div className="p-4 bg-slate-950/40 rounded-3xl border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Permissão do Browser</span>
                  <span className={`text-xs font-black uppercase tracking-wider ${
                    pushPermission === 'granted' ? 'text-green-400' :
                    pushPermission === 'denied' ? 'text-red-400' : 'text-blue-400'
                  }`}>
                    {pushPermission === 'granted' ? 'PERMITIDO ✓' :
                     pushPermission === 'denied' ? 'BLOQUEADO ✗' : 'NÃO CONFIGURADO ?'}
                  </span>
                </div>
                {pushPermission !== 'granted' ? (
                  <button
                    onClick={handleRequestPushPermission}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-[9px] uppercase tracking-wider rounded-xl transition-all"
                  >
                    Ativar
                  </button>
                ) : (
                  <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
                )}
              </div>

              {/* Indicador de Registo no Servidor */}
              <div className="p-4 bg-slate-950/40 rounded-3xl border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Sincronização Cloud</span>
                  <span className={`text-xs font-black uppercase tracking-wider ${
                    hasPushToken ? 'text-green-400' : 'text-amber-400'
                  }`}>
                    {hasPushToken ? 'SINCRONIZADO' : 'NÃO DETETADO'}
                  </span>
                </div>
                <button
                  onClick={handleForceSyncPush}
                  disabled={isSyncingPush}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-300 hover:text-white font-black text-[9px] uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncingPush ? 'animate-spin' : ''}`} />
                  Registar
                </button>
              </div>
            </div>

            {/* Mensagem de Instruções e Status */}
            {pushStatusMsg && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-[9px] font-black uppercase tracking-widest leading-normal">
                  {pushStatusMsg}
                </p>
              </div>
            )}

            {pushPermission === 'denied' && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-[9px] font-bold uppercase leading-normal">
                  DICA DE DESBLOQUEIO: Clique no ícone de cadeado (🔒) ao lado da URL na barra de endereços do seu navegador e altere a permissão de "Notificações" para "Permitir". Depois, clique em "Registar" acima.
                </p>
              </div>
            )}

            {/* Ações de Disparo de Teste */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleTestPush}
                disabled={isTestingPush || pushPermission !== 'granted'}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] tracking-widest uppercase rounded-2xl transition-all shadow-lg shadow-blue-500/10 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isTestingPush ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Testar Push Pessoal
              </button>

              {(isMaster || formUser.role === 'admin') && (
                <button
                  onClick={handleTestSystemPush}
                  disabled={isTestingSystemPush || pushPermission !== 'granted'}
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black text-[10px] tracking-widest uppercase rounded-2xl transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {isTestingSystemPush ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BellRing className="w-3.5 h-3.5 animate-bounce" />
                  )}
                  Disparar Push de Sistema
                </button>
              )}
            </div>
          </div>

          {/* SECÇÃO DESCARREGAR APP NATIVA (PWA) */}
          <div className="bg-gradient-to-r from-purple-900/10 to-indigo-900/10 border border-purple-500/20 p-8 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-2xl flex items-center justify-center shrink-0 border border-purple-500/20 shadow-inner">
                <Smartphone className="w-6 h-6 animate-pulse" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  AtriosWork App Móvel / Desktop <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
                </h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-normal max-w-lg">
                  Instale a aplicação nativa diretamente no seu ecrã inicial para receber notificações push integradas e desfrutar de toda a velocidade com acesso off-line completo.
                </p>
              </div>
            </div>
            <button 
              id="btn-settings-pwa-trigger"
              onClick={() => window.dispatchEvent(new CustomEvent('open-pwa-install-modal'))}
              className="w-full md:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl text-[10px] tracking-widest uppercase shrink-0 shadow-lg shadow-purple-500/10 transition-all hover:scale-[1.02] active:scale-95 duration-150 text-center"
            >
              Baixar Agora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
