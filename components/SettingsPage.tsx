
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, Save, User as UserIcon, Clock, ShieldAlert, Percent, Euro, Loader2, CheckCircle, Phone, Hash, Fingerprint, Star, ReceiptText, Info, Lock, ShieldCheck, Crown, Zap, Tag, ToggleLeft, ToggleRight, Coins, Smartphone, Sparkles, Calendar } from 'lucide-react';
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
  const isMaster = user.email?.toLowerCase()?.includes('master@atrioswork.com') || user.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || user.email?.toLowerCase()?.includes('master@digitalnexus.com') || user.email?.toLowerCase()?.includes('jefersongoes36@gmail.com');
  const [formUser, setFormUser] = useState<UserProfile>(() => ({
    ...user,
    overtimeRates: user.overtimeRates || { h1: 50, h2: 75, h3: 100 }
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [passwords, setPasswords] = useState({ new: '', confirm: '' });
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);
  const [passUpdateSuccess, setPassUpdateSuccess] = useState(false);

  const calculateMonthsBetween = (startDateStr: string, endDate: Date) => {
    const start = new Date(startDateStr);
    const end = endDate;
    if (isNaN(start.getTime())) return 0;
    
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) {
      months--;
    }
    return Math.max(0, months);
  };

  useEffect(() => { 
    setFormUser({
      ...user,
      overtimeRates: user.overtimeRates || { h1: 50, h2: 75, h3: 100 }
    }); 
  }, [user]);

  useEffect(() => {
    if (formUser.companyStartDate) {
      const months = calculateMonthsBetween(formUser.companyStartDate, new Date());
      setFormUser(p => {
        if (p.contractMonthsCompleted === undefined || p.contractMonthsCompleted !== months) {
          return { ...p, contractMonthsCompleted: months };
        }
        return p;
      });
    }
  }, [formUser.companyStartDate]);

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
      const finalFormUser = { ...formUser };
      let wasUnlockedAndNowLocked = false;
      if (finalFormUser.companyName && finalFormUser.companyName.trim() !== '' && (!finalFormUser.companyLockStatus || finalFormUser.companyLockStatus === 'unlocked')) {
        finalFormUser.companyLockStatus = 'locked';
        setFormUser(finalFormUser);
        wasUnlockedAndNowLocked = true;
      }
      const success = await setUser(finalFormUser);
      if (success) {
        setSaveSuccess(true);
        if (wasUnlockedAndNowLocked) {
          alert("Alterações da empresa guardadas com sucesso! Por segurança, os dados da empresa foram bloqueados novamente de forma automática.");
        }
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

           {/* Painel de Férias (Portugal) */}
           <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-400" />
                <h4 className="text-xs font-black text-white uppercase italic tracking-tighter">Férias (Portugal)</h4>
              </div>

              {/* Seletor Claro de Tempo de Empresa */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                  Tempo de Empresa / Contrato
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormUser(p => ({ ...p, isFirstYearAtCompany: true }))}
                    className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-24 ${
                      formUser.isFirstYearAtCompany
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/5'
                        : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider">Menos de 1 Ano</span>
                    <span className="text-[9px] font-medium leading-tight opacity-80 mt-1">
                      Estou no meu 1º ano de contrato na empresa.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormUser(p => ({ ...p, isFirstYearAtCompany: false }))}
                    className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-24 ${
                      !formUser.isFirstYearAtCompany
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/5'
                        : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider">Mais de 1 Ano</span>
                    <span className="text-[9px] font-medium leading-tight opacity-80 mt-1">
                      Trabalho na empresa há mais de 1 ano completo.
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[10px] text-slate-400 font-bold leading-normal uppercase tracking-wider">
                    {formUser.isFirstYearAtCompany ? (
                      <span>
                        <strong className="text-amber-400">1º Ano de Contrato:</strong> Ganha <strong className="text-white">2 dias úteis</strong> por mês de contrato, até um máximo de <strong className="text-white">20 dias</strong>. Gozo elegível após 6 meses completos.
                      </span>
                    ) : (
                      <span>
                        <strong className="text-slate-200">Mais de 1 Ano:</strong> Ganha <strong className="text-white">1.83 dias úteis</strong> de férias por mês trabalhado no ano corrente, acumulando até um limite normal of <strong className="text-white">22 dias úteis</strong> por ano.
                      </span>
                    )}
                  </div>
                </div>

                {(!formUser.companyName || formUser.companyName.trim() === '') ? (
                  <div className="p-5 bg-amber-500/10 rounded-2xl border border-amber-500/20 space-y-2 text-center animate-[fadeIn_0.3s_ease-out]">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-widest">
                      Férias Bloqueadas
                    </div>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                      A contagem de dias de férias iniciará assim que registar o nome da sua empresa no campo abaixo.
                    </p>
                  </div>
                ) : (
                  <>
                    {formUser.isFirstYearAtCompany && (
                      <div className="space-y-2 animate-[fadeIn_0.3s_ease-out]">
                        <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest ml-1">Meses Completos de Contrato</label>
                        <div className="relative">
                          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500" />
                          <input 
                            type="number" 
                            min="0"
                            max="12"
                            value={formUser.contractMonthsCompleted || 0} 
                            onChange={e => {
                              const val = Math.max(0, Math.min(12, Number(e.target.value)));
                              setFormUser(p => ({ ...p, contractMonthsCompleted: val }));
                            }}
                            className="w-full bg-slate-950 border border-amber-500/20 rounded-xl pl-12 pr-4 py-3 text-white font-black text-sm outline-none focus:ring-1 focus:ring-amber-500/50" 
                            placeholder="Ex: 6"
                          />
                        </div>
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed mt-2">
                          Dias adquiridos: <span className="text-amber-400 font-black">{Math.min(20, (formUser.contractMonthsCompleted || 0) * 2)} dias úteis</span>.
                          { (formUser.contractMonthsCompleted || 0) >= 6 ? " (Elegível para gozo de férias)" : " (Apenas elegível após completar 6 meses de contrato)" }
                        </p>
                      </div>
                    )}

                    {!formUser.isFirstYearAtCompany && (() => {
                      const today = new Date();
                      const currentYear = today.getFullYear();
                      const currentMonthNum = today.getMonth() + 1;
                      let monthsPassed = currentMonthNum;
                      
                      if (formUser.companyStartDate) {
                        const start = new Date(formUser.companyStartDate);
                        if (!isNaN(start.getTime())) {
                          const startYear = start.getFullYear();
                          const startMonth = start.getMonth() + 1;
                          
                          if (currentYear === startYear) {
                            if (currentMonthNum < startMonth) {
                              monthsPassed = 0;
                            } else {
                              monthsPassed = currentMonthNum - startMonth + 1;
                            }
                          } else if (currentYear < startYear) {
                            monthsPassed = 0;
                          }
                        }
                      }
                      
                      return (
                        <div className="p-5 bg-slate-950/40 rounded-2xl border border-slate-800 space-y-2 animate-[fadeIn_0.3s_ease-out]">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Ano Corrente: <span className="text-amber-400 font-black">{currentYear}</span> • Meses Decorridos: <span className="text-amber-400 font-black">{monthsPassed} meses</span>
                          </div>
                          <div className="text-[9px] text-slate-300 font-black uppercase tracking-widest">
                            Dias adquiridos até ao momento: <span className="text-amber-400 font-black">
                              {monthsPassed === 12 ? 22 : parseFloat((monthsPassed * 1.83).toFixed(1))} dias úteis
                            </span>
                          </div>
                          {formUser.companyStartDate && (
                            <p className="text-[8px] text-amber-500/80 font-bold uppercase tracking-widest leading-relaxed mt-1">
                              Contados a partir de {new Date(formUser.companyStartDate + 'T12:00:00').toLocaleDateString('pt-PT')}
                            </p>
                          )}
                          <p className="text-[8px] text-slate-500 font-medium uppercase tracking-wider leading-relaxed mt-1">
                            As férias são creditadas mensalmente ao ritmo de 1.83 dias por cada mês decorrido no ano.
                          </p>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
           </div>
        </div>

        <div className="md:col-span-2 space-y-8">
          {/* 1. DADOS PESSOAIS */}
          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl">
            <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3"><Hash className="w-5 h-5 text-purple-400" />{t('settings.idAndContact')}</h4>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.displayName')}</label><input type="text" value={formUser.name} onChange={(e) => setFormUser(p => ({ ...p, name: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
              <div className="space-y-2 md:col-span-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">E-mail do Usuário</label><input type="email" value={formUser.email || ''} onChange={(e) => setFormUser(p => ({ ...p, email: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" placeholder="usuario@email.com" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.taxId')}</label><input type="text" value={formUser.nif || ''} onChange={(e) => setFormUser(p => ({ ...p, nif: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">{t('settings.phone')}</label><input type="tel" value={formUser.phone || ''} onChange={(e) => setFormUser(p => ({ ...p, phone: e.target.value }))} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" /></div>
              
              {/* Campo Empresa */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Empresa</label>
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      value={formUser.companyName || ''} 
                      disabled={formUser.companyLockStatus === 'locked' || formUser.companyLockStatus === 'requested_unlock'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormUser(p => {
                          const updated = { ...p, companyName: val };
                          if (val && val.trim() !== '' && !updated.companyStartDate) {
                            updated.companyStartDate = new Date().toISOString().split('T')[0];
                          } else if (!val || val.trim() === '') {
                            updated.companyStartDate = undefined;
                          }
                          return updated;
                        });
                      }} 
                      className={`w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold ${
                        (formUser.companyLockStatus === 'locked' || formUser.companyLockStatus === 'requested_unlock') ? 'opacity-60 cursor-not-allowed bg-slate-950/20' : ''
                      }`}
                      placeholder="Nome da empresa onde trabalha"
                    />
                    {(formUser.companyLockStatus === 'locked' || formUser.companyLockStatus === 'requested_unlock') && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-rose-500 flex items-center gap-1.5">
                        <Lock className="w-4 h-4" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Bloqueado</span>
                      </span>
                    )}
                  </div>

                  {formUser.companyName && formUser.companyName.trim() !== '' && (
                    <>
                      {formUser.companyLockStatus === 'locked' && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...formUser, companyLockStatus: 'requested_unlock' as const };
                            setFormUser(updated);
                            setUser(updated).then(success => {
                              if (success) {
                                // 1. Transmitir em tempo real via canal de Broadcast Supabase
                                try {
                                  const channel = supabase.channel('atrioswork-admin-alerts');
                                  channel.subscribe((status) => {
                                    if (status === 'SUBSCRIBED') {
                                      channel.send({
                                        type: 'broadcast',
                                        event: 'unlock_request',
                                        payload: {
                                          name: formUser.name || formUser.email,
                                          email: formUser.email
                                        }
                                      }).then(() => {
                                        setTimeout(() => supabase.removeChannel(channel), 1000);
                                      });
                                    }
                                  });
                                } catch (broadcastErr) {
                                  console.warn('Erro ao transmitir broadcast de desbloqueio:', broadcastErr);
                                }

                                // 2. Enviar notificação push centralizada e segura 100% via Backend
                                fetch('/api/notify', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    type: 'unlock_request',
                                    name: formUser.name || formUser.email,
                                    email: formUser.email
                                  })
                                }).catch(err => console.warn('Erro ao enviar push de desbloqueio:', err));

                                alert("Solicitação de desbloqueio enviada ao Administrador!");
                              }
                            });
                          }}
                          className="px-6 py-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
                        >
                          Solicitar Desbloqueio
                        </button>
                      )}
                      {formUser.companyLockStatus === 'requested_unlock' && (
                        <div className="px-6 py-4 bg-slate-800/30 border border-slate-800 text-slate-400 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2">
                          <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
                          Aguardando Desbloqueio
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* NIF da Empresa */}
              {formUser.companyName && formUser.companyName.trim() !== '' && (
                <div className="space-y-2 md:col-span-2 animate-[fadeIn_0.3s_ease-out]">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                    NIF da Empresa
                  </label>
                  <input 
                    type="text" 
                    value={formUser.companyNif || ''} 
                    disabled={formUser.companyLockStatus === 'locked' || formUser.companyLockStatus === 'requested_unlock'}
                    onChange={(e) => setFormUser(p => ({ ...p, companyNif: e.target.value }))} 
                    className={`w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold ${
                      (formUser.companyLockStatus === 'locked' || formUser.companyLockStatus === 'requested_unlock') ? 'opacity-60 cursor-not-allowed bg-slate-950/20' : ''
                    }`}
                    placeholder="Ex: 512345678"
                  />
                </div>
              )}

              {/* Data de Início na Empresa */}
              {formUser.companyName && formUser.companyName.trim() !== '' && (
                <div className="space-y-2 md:col-span-2 animate-[fadeIn_0.3s_ease-out]">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                    Data de Início na Empresa (Contagem de Férias)
                  </label>
                  <input 
                    type="date" 
                    value={formUser.companyStartDate || ''} 
                    disabled={formUser.companyLockStatus === 'locked' || formUser.companyLockStatus === 'requested_unlock'}
                    onChange={(e) => setFormUser(p => ({ ...p, companyStartDate: e.target.value }))} 
                    className={`w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold ${
                      (formUser.companyLockStatus === 'locked' || formUser.companyLockStatus === 'requested_unlock') ? 'opacity-60 cursor-not-allowed bg-slate-950/20' : ''
                    }`}
                  />
                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed mt-1">
                    Insira a data em que começou a trabalhar nesta empresa. A contagem dos seus dias de férias baseia-se exatamente nesta data de início.
                  </p>
                </div>
              )}
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
