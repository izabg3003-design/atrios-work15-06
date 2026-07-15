
import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, TrendingUp, DollarSign, Users, Award, Calendar, Loader2, ArrowUpRight, BarChart3, Activity, Target, Zap, Crown, PiggyBank, Globe, AlertCircle, PieChart as PieIcon, Scale, CreditCard, Receipt, ShieldCheck, Tag, Download, FileText, CheckCircle, History, Archive, Printer, X, LayoutList, RefreshCcw, FileDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { supabase } from '../lib/supabase';

interface Props {
  f: (val: number) => string;
}

const AdminGlobalAnalytics: React.FC<Props> = ({ f }) => {
  const [loading, setLoading] = useState(true);
  const [vendorSalesBreakdown, setVendorSalesBreakdown] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalComm: 0,
    totalRawRevenue: 0,
    totalGrossRevenue: 0,
    totalIva: 0,
    totalStripeFees: 0,
    totalNetProfit: 0,
    totalMembers: 0,
    activeVendors: 0,
    totalDiscounts: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [distributionData, setDistributionData] = useState<any[]>([]);

  const fetchGlobalData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: vData } = await supabase.from('vendors').select('*');
      const { data: pData } = await supabase.from('profiles').select('*');
      
      const masterProfile = pData?.find(p => p.email?.toLowerCase()?.includes('master@atrioswork.com') || p.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || p.email?.toLowerCase()?.includes('master@digitalnexus.com'));
      
      let masterSub: any = {};
      try {
        masterSub = typeof masterProfile?.subscription === 'string' 
          ? JSON.parse(masterProfile.subscription) 
          : (masterProfile?.subscription || {});
      } catch (e) { masterSub = {}; }

      const globalComm = masterSub.master_global_commission ?? 1.50;
      const globalDisc = (masterSub.master_global_discount ?? 5) / 100;

      if (pData) {
        // Incluir todos os usuários com papel 'user' que tenham assinatura paga ativa (PRO ou ACTIVE_PAID)
        const allSalesProfiles = pData.filter(p => {
          if (p.role !== 'user') return false;
          let sub: any = {};
          try {
            sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
          } catch (e) { sub = {}; }
          
          return p.status === 'PRO' || p.status === 'ACTIVE_PAID' || sub?.status === 'PRO' || sub?.status === 'ACTIVE_PAID';
        });
        
        const salesCount = allSalesProfiles.length;
        
        // Obter os códigos de parceiro únicos das vendas (excluindo os vazios)
        const uniqueCodes = Array.from(new Set(
          allSalesProfiles
            .map(p => p.vendor_code?.toString().trim().toUpperCase())
            .filter(code => code && code !== '')
        ));
        
        let totalCommissionsPaid = 0;
        let totalDiscountsGiven = 0;

        const breakdown = uniqueCodes.map(code => {
          const knownVendor = vData?.find(v => v.code?.toString().trim().toUpperCase() === code);
          const vendorProfile = pData?.find(p => p.id === knownVendor?.id);
          
          let vendorSub: any = {};
          try {
            vendorSub = typeof vendorProfile?.subscription === 'string' 
              ? JSON.parse(vendorProfile.subscription) 
              : (vendorProfile?.subscription || {});
          } catch (e) { vendorSub = {}; }

          const salesForThisCode = allSalesProfiles.filter(p => p.vendor_code?.toString().trim().toUpperCase() === code);
          // PRIORIDADE: Tabela de Vendors (para sincronizar com a alteração do Admin) -> Global
          const vendorComm = knownVendor?.commission_rate ?? globalComm;
          const vendorDisc = (vendorSub.custom_discount ?? 5) / 100;

          const rev = salesForThisCode.length * (9.90 * (1 - vendorDisc));
          const comm = salesForThisCode.length * vendorComm;
          const disc = salesForThisCode.length * (9.90 * vendorDisc);

          totalCommissionsPaid += comm;
          totalDiscountsGiven += disc;

          return {
            name: knownVendor?.name || `Código: ${code}`,
            code: code,
            count: salesForThisCode.length,
            revenue: rev,
            comm: comm
          };
        });

        // Adicionar Vendas Diretas (Sem Parceiro) se existirem no breakdown
        const directSales = allSalesProfiles.filter(p => !p.vendor_code || p.vendor_code.toString().trim() === '');
        if (directSales.length > 0) {
          breakdown.push({
            name: 'Vendas Diretas (Sem Parceiro)',
            code: 'DIRETO',
            count: directSales.length,
            revenue: directSales.length * 9.90,
            comm: 0
          });
        }

        breakdown.sort((a, b) => b.count - a.count);
        setVendorSalesBreakdown(breakdown);

        const price = 9.90;
        const ivaRate = 0.23;
        const stripePercent = 0.015;
        const stripeFlat = 0.25;

        const totalRawRevenue = salesCount * price;
        const totalGrossReal = totalRawRevenue - totalDiscountsGiven;
        const totalIva = totalGrossReal * ivaRate;
        const totalStripeFees = (totalGrossReal * stripePercent) + (salesCount * stripeFlat);
        const totalNetProfit = totalGrossReal - (totalIva + totalStripeFees + totalCommissionsPaid);
        
        setStats({
          totalSales: salesCount,
          totalComm: totalCommissionsPaid,
          totalRawRevenue: totalRawRevenue,
          totalGrossRevenue: totalGrossReal,
          totalIva,
          totalStripeFees,
          totalNetProfit,
          totalMembers: pData.filter(p => p.role === 'user').length,
          activeVendors: vData?.length || 0,
          totalDiscounts: totalDiscountsGiven
        });

        setDistributionData([
          { name: 'Lucro Líquido', value: Math.max(0, totalNetProfit), color: '#10b981' },
          { name: 'IVA (23%)', value: totalIva, color: '#3b82f6' },
          { name: 'Taxas Stripe', value: totalStripeFees, color: '#f43f5e' },
          { name: 'Comissão Venda', value: totalCommissionsPaid, color: '#f59e0b' },
          { name: 'Descontos Online', value: totalDiscountsGiven, color: '#ec4899' },
        ]);

        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const currentYear = new Date().getFullYear();
        
        const monthlyStats = months.map((m, i) => {
          const monthlySales = allSalesProfiles.filter(p => {
            try {
              const sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
              const d = new Date(sub?.startDate);
              return d.getMonth() === i && d.getFullYear() === currentYear;
            } catch (e) { return false; }
          });
          
          const count = monthlySales.length;
          const mBruto = count * price;
          
          const mComm = monthlySales.reduce((acc, sale) => {
            const code = sale.vendor_code?.toString().trim().toUpperCase();
            if (!code) return acc;
            const knownVendor = vData?.find(v => v.code?.toString().trim().toUpperCase() === code);
            const rate = knownVendor?.commission_rate ?? globalComm;
            return acc + rate;
          }, 0);

          const mDisc = monthlySales.reduce((acc, sale) => {
            const code = sale.vendor_code?.toString().trim().toUpperCase();
            if (!code) return acc;
            const knownVendor = vData?.find(v => v.code?.toString().trim().toUpperCase() === code);
            const vendorProfile = pData?.find(p => p.id === knownVendor?.id);
            let vSub: any = {};
            try { vSub = typeof vendorProfile?.subscription === 'string' ? JSON.parse(vendorProfile.subscription) : (vendorProfile?.subscription || {}); } catch(e) {}
            const discRate = (vSub.custom_discount ?? 5) / 100;
            return acc + (price * discRate);
          }, 0);

          const mIva = (mBruto - mDisc) * ivaRate;
          const mFees = ((mBruto - mDisc) * stripePercent) + (count * stripeFlat);

          const mNet = (mBruto - mDisc) - (mIva + mFees + mComm);
          return { name: m, lucro: Number(Math.max(0, mNet).toFixed(2)) };
        });
        setChartData(monthlyStats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalData();

    // Poller de redundância ativa a cada 4 segundos para garantir sincronismo total e imediato no painel master
    const poller = setInterval(() => {
      fetchGlobalData(true);
    }, 4000);

    if (!supabase || typeof supabase.channel !== 'function') {
      return () => clearInterval(poller);
    }

    try {
      const channelProfiles = supabase.channel('analytics-profiles-realtime');
      if (channelProfiles && typeof channelProfiles.on === 'function') {
        channelProfiles
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
            fetchGlobalData(true);
          })
          .subscribe();
      }

      const channelVendors = supabase.channel('analytics-vendors-realtime');
      if (channelVendors && typeof channelVendors.on === 'function') {
        channelVendors
          .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => {
            fetchGlobalData(true);
          })
          .subscribe();
      }

      return () => {
        clearInterval(poller);
        try {
          if (typeof supabase.removeChannel === 'function') {
            if (channelProfiles) supabase.removeChannel(channelProfiles);
            if (channelVendors) supabase.removeChannel(channelVendors);
          }
        } catch (e) {
          console.warn('[Realtime Analytics cleanup error]:', e);
        }
      };
    } catch (realtimeErr) {
      console.warn('[Realtime Analytics setup error]:', realtimeErr);
      return () => clearInterval(poller);
    }
  }, [fetchGlobalData]);

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `ATRIOSWORK_GLOBAL_ANALYTICS_${new Date().getFullYear()}`;
    setTimeout(() => {
      window.print();
      document.title = originalTitle;
    }, 100);
  };

  const renderPieLabel = ({ name, percent }: any) => {
    return `${(percent * 100).toFixed(0)}%`;
  };

  if (loading) return (
    <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
      <div className="w-24 h-24 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin"></div>
      <p className="text-[11px] font-black text-white uppercase tracking-[0.4em]">Analytics Sync...</p>
    </div>
  );

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print">
        <div className="space-y-1">
          <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">DASHBOARD <span className="text-emerald-400">MASTER</span></h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">AtriosWork — Auditoria Digital</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => fetchGlobalData()} className="p-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition-all">
            <RefreshCcw className="w-4 h-4" />
          </button>
          <button onClick={handlePrint} className="flex items-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl">
            <FileDown className="w-4 h-4" /> Exportar Analytics
          </button>
        </div>
      </div>

      <div className="print-container">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8 print:grid-cols-4">
          {[
            { label: 'Ativações (Membros)', val: stats.totalSales, color: 'white' },
            { label: 'Faturação Bruta', val: f(stats.totalRawRevenue), color: 'white' },
            { label: 'Faturação Real', val: f(stats.totalGrossRevenue), color: 'white' },
            { label: 'IVA (Base Bruta)', val: f(stats.totalIva), color: 'blue-400' },
            { label: 'Taxas Stripe', val: f(stats.totalStripeFees), color: 'rose-400' },
            { label: 'Comissão Venda', val: f(stats.totalComm), color: 'amber-400' },
            { label: 'Descontos Online', val: f(stats.totalDiscounts), color: 'pink-400' },
            { label: 'Líquido AtriosWork', val: f(stats.totalNetProfit), color: 'emerald-400', special: true },
          ].map((item, i) => (
            <div key={i} className={`bg-slate-800/20 border ${item.special ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800'} p-5 rounded-[2rem] shadow-lg print:border-black print:bg-white`}>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 print:text-black">{item.label}</p>
              <p className={`text-lg font-black tracking-tighter text-${item.color} print:text-black`}>{item.val}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 print:grid-cols-2">
          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[3rem] space-y-8 print:border-black print:bg-white">
             <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3 print:text-black">
               <Activity className="w-5 h-5 text-emerald-400 no-print" /> Performance Trimestral (Líquido)
             </h3>
             <div className="h-[250px] w-full no-print">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={chartData}>
                   <defs><linearGradient id="cLucro" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 900}} />
                   <YAxis hide />
                   <Area type="monotone" dataKey="lucro" stroke="#10b981" fillOpacity={1} fill="url(#cLucro)" strokeWidth={4} isAnimationActive={false} />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
          </div>

          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[3rem] space-y-8 print:border-black print:bg-white">
             <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3 print:text-black">
               <PieIcon className="w-5 h-5 text-purple-400 no-print" /> Balanço de Distribuição
             </h3>
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-center">
                <div className="h-[220px] w-full no-print">
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                         <Pie data={distributionData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" labelLine={false} label={renderPieLabel} isAnimationActive={false}>
                            {distributionData.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                            ))}
                         </Pie>
                         <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', color: '#fff' }} itemStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                      </PieChart>
                   </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                   {distributionData.map((d, i) => (
                     <div key={i} className="flex justify-between items-center border-b border-slate-800/40 pb-2 print:border-black">
                       <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{backgroundColor: d.color}}></div>
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest print:text-black">{d.name}</span>
                       </div>
                       <span className="text-xs font-black print:text-black" style={{color: d.color}}>{f(d.value)}</span>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminGlobalAnalytics;
