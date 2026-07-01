
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingCart, Search, Loader2, User, Calendar, ShieldCheck, ShieldAlert, Filter, ArrowLeft, RefreshCw, Hash, Tag, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';

interface Props {
  user: UserProfile;
  adminOverrideVendor?: any; 
  onBackToAdmin?: () => void;
}

const VendorSalesPage: React.FC<Props> = ({ user, adminOverrideVendor, onBackToAdmin }) => {
  const [sales, setSales] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorCode, setVendorCode] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState<string>('');

  const fetchVendorAndSales = useCallback(async () => {
    const activeUserId = adminOverrideVendor?.id || user.id;
    if (!activeUserId) return;
    
    setLoading(true);
    try {
      let activeCode = '';
      let activeName = '';

      if (adminOverrideVendor) {
        activeCode = adminOverrideVendor.code || '';
        activeName = adminOverrideVendor.name || '';
      } 
      
      if (!activeCode) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('vendor_code, name')
          .eq('id', activeUserId)
          .maybeSingle();
        
        activeCode = pData?.vendor_code || '';
        activeName = pData?.name || '';
      }

      if (!activeCode) {
        const { data: vData } = await supabase
          .from('vendors')
          .select('code, name')
          .eq('id', activeUserId)
          .maybeSingle();
        
        activeCode = vData?.code || '';
        activeName = vData?.name || '';
      }

      const finalCode = (activeCode || '').trim().toUpperCase();
      setVendorCode(finalCode);
      setVendorName(activeName);

      if (finalCode) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .ilike('vendor_code', finalCode)
          .neq('id', activeUserId)
          .eq('role', 'user');
        
        if (error) throw error;
        
        const sortedSales = (data || []).sort((a: any, b: any) => {
          try {
            const subA = typeof a.subscription === 'string' ? JSON.parse(a.subscription) : a.subscription;
            const subB = typeof b.subscription === 'string' ? JSON.parse(b.subscription) : b.subscription;
            return new Date(subB?.startDate || 0).getTime() - new Date(subA?.startDate || 0).getTime();
          } catch { return 0; }
        });

        setSales(sortedSales);
      } else {
        setSales([]);
      }
    } catch (e: any) {
      console.error("Erro na Sincronização de Vendas:", e.message);
    } finally {
      setLoading(false);
    }
  }, [user.id, adminOverrideVendor]);

  useEffect(() => {
    fetchVendorAndSales();
  }, [fetchVendorAndSales]);

  const filteredSales = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return sales;
    return sales.filter((s: any) => 
      (s.name?.toLowerCase() || '').includes(term) || 
      (s.email?.toLowerCase() || '').includes(term) ||
      (s.id?.toLowerCase() || '').includes(term)
    );
  }, [sales, searchTerm]);

  const getStatus = (item: any) => {
    try {
      if (item.status === 'SUSPENDED' || item.status === 'suspended') return false;
      if (item.status === 'FREE' || item.status === 'free' || item.status === 'PRO' || item.status === 'pro') return true;
      const sub = typeof item.subscription === 'string' ? JSON.parse(item.subscription) : item.subscription;
      return sub?.isActive ?? true;
    } catch (e) { return true; }
  };

  const getMemberDate = (item: any) => {
    try {
      const sub = typeof item.subscription === 'string' ? JSON.parse(item.subscription) : item.subscription;
      if (sub?.startDate) return new Date(sub.startDate).toLocaleDateString('pt-PT');
      return '---';
    } catch { return '---'; }
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div className="space-y-1">
          {adminOverrideVendor && (
            <button onClick={onBackToAdmin} className="flex items-center gap-2 text-slate-500 hover:text-white transition-all mb-4 group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">AtriosWork Command Hub</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-green-400" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">AtriosWork Commercial Ledger</span>
          </div>
          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">GAVETA DE <span className="text-green-400">VENDAS</span></h2>
          
          <div className="flex flex-col gap-1 mt-4">
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Responsável AtriosWork: <span className="text-white">{vendorName}</span></p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
                <Tag className="w-3 h-3 text-green-500" />
                <p className="text-[10px] font-mono font-black text-green-500 tracking-widest uppercase">{vendorCode || 'CÓDIGO NÃO VINCULADO'}</p>
              </div>
              <button onClick={fetchVendorAndSales} className="p-2 bg-slate-800 hover:bg-green-600 hover:text-white text-slate-400 rounded-lg transition-all">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/40 p-1 rounded-[2rem] border border-slate-700/50 flex items-center gap-4 px-8 py-5 shadow-2xl relative overflow-hidden group">
           <div className="absolute inset-0 bg-green-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-700"></div>
           <div className="relative z-10 text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vendas (Clientes)</p>
              <p className="text-3xl font-black text-white tracking-tighter">{sales.length} Membros</p>
           </div>
           <div className="relative z-10 w-[1px] h-10 bg-slate-700 mx-2"></div>
           <TrendingUp className="w-8 h-8 text-green-400 relative z-10" />
        </div>
      </div>

      <div className="bg-slate-800/20 border border-slate-800 rounded-[3rem] overflow-hidden backdrop-blur-md shadow-2xl relative">
        <div className="p-8 border-b border-slate-800 flex flex-col md:flex-row gap-6 justify-between items-center bg-slate-900/40">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Pesquisar por nome, email ou ID..." 
              className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white text-sm outline-none focus:ring-2 focus:ring-green-500/30 transition-all font-medium" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="flex items-center gap-3 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-950/50 px-4 py-2 rounded-xl border border-slate-800">
            <Hash className="w-3.5 h-3.5 text-green-500" />
            <span>Digital Ledger Sync Active</span>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950/30 text-slate-500 text-[10px] uppercase font-black tracking-[0.2em] border-b border-slate-800">
                <th className="px-10 py-6">Membro Cliente</th>
                <th className="px-6 py-6">Canal de Contacto</th>
                <th className="px-6 py-6 text-center">Status</th>
                <th className="px-10 py-6 text-right">Data de Adesão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-10 h-10 text-green-500 animate-spin" />
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Sincronizando Base de Dados...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-40">
                      <ShoppingCart className="w-12 h-12 text-slate-600" />
                      <div className="space-y-1">
                        <p className="text-sm font-black text-white uppercase tracking-tighter italic">Nenhuma venda encontrada</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Apenas contas de clientes (role user) são listadas aqui.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredSales.map((item: any) => {
                const isActive = getStatus(item);
                return (
                  <tr key={item.id} className="transition-all hover:bg-green-500/[0.02] group">
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center font-black text-green-400 text-lg shadow-inner group-hover:border-green-500/30 transition-colors">
                          {item.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm group-hover:text-green-400 transition-colors">{item.name}</p>
                          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter mt-0.5">{item.id?.substring(0, 18)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <p className="text-white text-[11px] font-medium">{item.email}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{item.phone || '---'}</p>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${ isActive ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                        {isActive ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                        {isActive ? 'ATIVO' : 'SUSPENSO'}
                      </div>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <div className="flex flex-col items-end">
                        <p className="text-white text-xs font-black font-mono tracking-widest">{getMemberDate(item)}</p>
                        <p className="text-[9px] text-slate-600 font-black uppercase tracking-tighter mt-1">Processado por AtriosWorkCloud</p>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VendorSalesPage;
