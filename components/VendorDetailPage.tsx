
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Award, TrendingUp, DollarSign, Users, RefreshCw, Zap, Fingerprint, ShoppingCart, BarChart3, UserCheck, ShieldCheck, Tag } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { Vendor, UserProfile } from '../types';

interface Props {
  vendorId: string | null;
  currentUser?: UserProfile;
  onBack: void | (() => void);
  f: (val: number) => string;
  isVendorSelf?: boolean;
}

const VendorDetailPage: React.FC<Props> = ({ vendorId, currentUser, onBack, f, isVendorSelf = false }) => {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [recentMembers, setRecentMembers] = useState<UserProfile[]>([]);
  const [realSalesCount, setRealSalesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [masterCommission, setMasterCommission] = useState(1.50);

  const fetchVendorData = useCallback(async (silent = false) => {
    try {
      let targetId = vendorId;
      
      if (!targetId || targetId === "") {
        const { data: sessionData } = await supabase.auth.getSession();
        targetId = sessionData.session?.user?.id || currentUser?.id || null;
      }

      if (!targetId) {
        setLoading(false);
        return;
      }
      
      if (!silent) setLoading(true);
      const { data: mData } = await supabase.from('profiles').select('subscription').or('email.ilike.master@atrioswork.com,email.ilike.izarelleBraga@gmail.com,email.ilike.master@digitalnexus.com').maybeSingle();
      if (mData) {
        const sub = typeof mData.subscription === 'string' ? JSON.parse(mData.subscription) : mData.subscription;
        setMasterCommission(sub?.master_global_commission ?? 1.50);
      }

      let { data: vData } = await supabase.from('vendors').select('*').eq('id', targetId).maybeSingle();

      if (!vData && isVendorSelf && currentUser && currentUser.id) {
        await handleAutoSync(true);
        return; 
      }

      if (vData) {
        setVendor(vData);
        const code = (vData.code || '').trim().toUpperCase();
        
        if (code) {
          const { data: mDataMembers, error: membersError } = await supabase
            .from('profiles')
            .select('*')
            .ilike('vendor_code', code)
            .neq('id', targetId);
          
          if (!membersError && mDataMembers) {
            const filteredMembers = mDataMembers.filter((m: any) => {
              const email = (m.email || '').toLowerCase();
              const isMasterEmail = 
                email.includes('master@atrioswork.com') || 
                email.includes('izarellebraga@gmail.com') || 
                email.includes('master@digitalnexus.com') ||
                email.includes('jefersongoes36@gmail.com');
              return m.role !== 'admin' && !isMasterEmail;
            });
            setRealSalesCount(filteredMembers.length);

            const sorted = [...filteredMembers].sort((a, b) => {
              try {
                const subA = typeof a.subscription === 'string' ? JSON.parse(a.subscription) : a.subscription;
                const subB = typeof b.subscription === 'string' ? JSON.parse(b.subscription) : b.subscription;
                return new Date(subB?.startDate || 0).getTime() - new Date(subA?.startDate || 0).getTime();
              } catch { return 0; }
            }).slice(0, 5);
            setRecentMembers(sorted);
          }
        }
      }
    } catch (e) {
      console.error("AtriosWork Fetch Error:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [vendorId, currentUser, isVendorSelf, masterCommission]);

  useEffect(() => {
    fetchVendorData();
  }, [fetchVendorData]);

  const handleAutoSync = async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const targetId = authUser.id;
      const generatedCode = (currentUser?.vendor_code || ('AW-' + Math.random().toString(36).substr(2, 5).toUpperCase())).trim().toUpperCase();
      
      await supabase.from('profiles').update({ vendor_code: generatedCode, role: 'vendor' }).eq('id', targetId);

      await supabase.from('vendors').upsert({
        id: targetId,
        name: currentUser?.name || authUser.user_metadata?.full_name || 'Parceiro AtriosWork',
        email: currentUser?.email || authUser.email || '',
        code: generatedCode,
        commission_rate: masterCommission,
        total_sales: 0
      });

      if (silent) {
        fetchVendorData(true);
      } else {
        window.location.reload();
      }
    } catch (e) {
      console.error("AtriosWork Auto-sync Failure:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const getMemberAtriosWorkId = (member: UserProfile) => {
    try {
      const sub = typeof member.subscription === 'string' ? JSON.parse(member.subscription) : member.subscription;
      return sub?.id || 'AW-PENDING';
    } catch { return 'AW-PENDING'; }
  };

  const totalCommissionEarned = realSalesCount * (vendor?.commission_rate || masterCommission);

  if (loading && !isSyncing) return (
    <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
      <Loader2 className="w-12 h-12 text-green-500 animate-spin" />
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronizando AtriosWork Cloud...</p>
    </div>
  );

  if (!vendor) return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md bg-slate-800/40 border border-slate-800 p-12 rounded-[3rem] text-center space-y-6 shadow-2xl relative overflow-hidden">
        <Fingerprint className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Acesso <span className="text-amber-500">Pendente</span></h3>
        <p className="text-slate-400 text-sm leading-relaxed">A sua conta de parceiro AtriosWork está a ser configurada.</p>
        <button onClick={() => handleAutoSync()} className="w-full bg-green-600 hover:bg-green-500 text-slate-900 font-black py-5 rounded-2xl transition-all flex flex-col items-center gap-1">
          <Zap className="w-5 h-5" />
          <span className="text-xs uppercase tracking-widest">VINCULAR AGORA</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          {!isVendorSelf && typeof onBack === 'function' && (
            <button onClick={onBack} className="flex items-center gap-3 text-slate-500 hover:text-white transition-all group mb-2">
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-2 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">AtriosWork Command Hub</span>
            </button>
          )}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-green-500/20 rounded-[1.5rem] border border-green-500/30 flex items-center justify-center font-black text-green-400 text-3xl shadow-xl">{vendor.name?.charAt(0)}</div>
            <div>
              <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">{vendor.name}</h2>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => fetchVendorData(true)} className="flex items-center gap-2 text-xs text-slate-500 hover:text-green-400 transition-colors">
                  <RefreshCw className="w-3" />
                  <span className="font-bold uppercase tracking-widest text-[8px]">Sincronizar Rede Agora</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 px-8 py-5 bg-slate-800/40 rounded-[2rem] border border-slate-700/50 shadow-lg">
          <Tag className="w-6 h-6 text-green-400" />
          <div>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Código Master Ativo</p>
            <p className="text-xl font-black text-white font-mono mt-1 tracking-widest">{vendor.code}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-3 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><Users className="w-16 h-16" /></div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Membros na Rede</p>
          <p className="text-5xl font-black text-white tracking-tighter">{realSalesCount}</p>
          <div className="flex items-center gap-2 text-green-400">
             <TrendingUp className="w-3 h-3" />
             <span className="text-[9px] font-black uppercase">Live AtriosWork Sync</span>
          </div>
        </div>

        <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] space-y-3 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><DollarSign className="w-16 h-16" /></div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Comissões Acumuladas</p>
          <p className="text-5xl font-black text-green-500 tracking-tighter">{f(totalCommissionEarned)}</p>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Saldo Provisionado</p>
        </div>

        <div className="bg-gradient-to-br from-purple-600/20 to-transparent border border-purple-500/20 p-8 rounded-[2.5rem] flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-2">
            <Award className="w-6 h-6 text-purple-400" />
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Rank de Parceiro</p>
          </div>
          <p className="text-2xl font-black text-white tracking-tight italic uppercase">Nível <span className="text-purple-400">Elite Master</span></p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[3rem] space-y-6">
           <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
             <BarChart3 className="w-5 h-5 text-green-400" /> Atividade Semanal
           </h3>
           <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[
                  { name: 'Seg', sales: Math.floor(realSalesCount * 0.1) },
                  { name: 'Ter', sales: Math.floor(realSalesCount * 0.15) },
                  { name: 'Qua', sales: Math.floor(realSalesCount * 0.2) },
                  { name: 'Qui', sales: Math.floor(realSalesCount * 0.1) },
                  { name: 'Sex', sales: Math.floor(realSalesCount * 0.3) },
                  { name: 'Sáb', sales: Math.floor(realSalesCount * 0.1) },
                  { name: 'Dom', sales: Math.floor(realSalesCount * 0.05) },
                ]}>
                  <defs><linearGradient id="col" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 900}} />
                  <Tooltip contentStyle={{backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #334155'}} />
                  <Area type="monotone" dataKey="sales" stroke="#22c55e" fillOpacity={1} fill="url(#col)" strokeWidth={3} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>

        <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[3rem] flex flex-col">
           <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3 mb-8">
             <UserCheck className="w-5 h-5 text-purple-400" /> Últimas Ativações na Rede
           </h3>
           <div className="space-y-4 flex-1">
              {recentMembers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-slate-500"><Users className="w-10 h-10" /><p className="text-[10px] font-black uppercase mt-2">Aguardando novos membros...</p></div>
              ) : recentMembers.map((member, i) => (
                <div key={member.id || i} className="flex items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50 group hover:border-purple-500/50 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center font-black text-purple-400 text-xs">{member.name?.charAt(0)}</div>
                    <div>
                      <p className="text-sm font-bold text-white leading-tight">{member.name}</p>
                      <p className="text-[9px] text-slate-500 font-mono font-bold mt-1 tracking-[0.15em] uppercase">
                         ID: <span className="text-purple-400">{getMemberAtriosWorkId(member)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20"><span className="text-[8px] font-black text-green-400 uppercase tracking-tighter">Ativo</span></div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

export default VendorDetailPage;
