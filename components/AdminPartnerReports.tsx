
import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Download, Calendar, DollarSign, Users, Award, ChevronLeft, ChevronRight, Printer, CheckCircle2, Search, Loader2, TrendingUp, Filter, ShoppingCart, Percent, FileDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format, endOfMonth, isWithinInterval, startOfMonth, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

interface Props {
  f: (val: number) => string;
}

const AdminPartnerReports: React.FC<Props> = ({ f }) => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [masterConfig, setMasterConfig] = useState({ commission: 1.50 });
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: vData } = await supabase.from('vendors').select('*');
      const { data: pData } = await supabase.from('profiles').select('*');
      
      const masterData = pData?.find((p: any) => p.email?.toLowerCase()?.includes('master@atrioswork.com') || p.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || p.email?.toLowerCase()?.includes('master@digitalnexus.com') || p.email?.toLowerCase()?.includes('jefersongoes36@gmail.com'));
      if (masterData) {
        let sub: any = {};
        try { sub = typeof masterData.subscription === 'string' ? JSON.parse(masterData.subscription) : (masterData.subscription || {}); } catch(e) {}
        setMasterConfig({ commission: sub.master_global_commission ?? 1.50 });
      }

      setVendors(vData || []);
      setProfiles(pData || []);
    } catch (e) {
      console.error("Erro AtriosWork Reports:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: pt });

  const reportData = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);

    return vendors.map((vendor: any) => {
      const vendorCode = (vendor.code || '').trim().toUpperCase();
      const vendorProfile = profiles.find((p: any) => p.id === vendor.id);
      
      let vSub: any = {};
      try { vSub = typeof vendorProfile?.subscription === 'string' ? JSON.parse(vendorProfile.subscription) : (vendorProfile?.subscription || {}); } catch(e) {}

      const vendorSales = profiles.filter((p: any) => {
        const pCode = (p.vendor_code || '').trim().toUpperCase();
        const email = (p.email || '').toLowerCase();
        const isMasterEmail = email.includes('master@atrioswork.com') || email.includes('izarellebraga@gmail.com') || email.includes('master@digitalnexus.com') || email.includes('jefersongoes36@gmail.com');
        if (pCode !== vendorCode || p.id === vendor.id || p.role !== 'user' || isMasterEmail) return false;

        try {
          const sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
          if (!sub || !sub.startDate) return false;
          const date = parseISO(sub.startDate);
          return isWithinInterval(date, { start, end });
        } catch { return false; }
      });

      const vendorComm = vSub.custom_commission ?? vendor.commission_rate ?? masterConfig.commission;
      const vendorDisc = (vSub.custom_discount ?? 5) / 100;

      const totalRevenue = vendorSales.length * (9.90 * (1 - vendorDisc));
      const commissionAmount = vendorSales.length * vendorComm;

      return {
        ...vendor,
        currentCommRate: vendorComm,
        salesCount: vendorSales.length,
        totalRevenue,
        commissionAmount,
        sales: vendorSales
      };
    }).sort((a: any, b: any) => b.commissionAmount - a.commissionAmount);
  }, [vendors, profiles, currentDate, masterConfig]);

  const filteredReports = reportData.filter((r: any) => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totals = useMemo(() => {
    return reportData.reduce((acc: any, curr: any) => ({
      sales: acc.sales + curr.salesCount,
      commission: acc.commission + curr.commissionAmount
    }), { sales: 0, commission: 0 });
  }, [reportData]);

  const handlePrint = () => {
    const originalTitle = document.title;
    const dateStr = format(currentDate, 'MMMM_yyyy').toUpperCase();
    document.title = `ATRIOSWORK_PARTNER_COMMISSIONS_${dateStr}`;
    setTimeout(() => {
      window.print();
      document.title = originalTitle;
    }, 100);
  };

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Calculando Comissões...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 no-print">
        <div className="flex items-center gap-4 bg-slate-800/40 p-1 rounded-2xl border border-slate-700/50">
          <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:text-amber-500 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-black text-xs uppercase tracking-widest min-w-[150px] text-center text-white">
            {monthLabel}
          </span>
          <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:text-amber-500 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Pesquisar vendedor..." 
              className="bg-slate-950/50 border border-slate-800 rounded-xl pl-12 pr-4 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-amber-500 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 text-slate-950 rounded-xl hover:bg-amber-500 transition-all shadow-lg active:scale-95 font-black text-[10px] uppercase tracking-widest">
            <FileDown className="w-4 h-4" /> Exportar Comissões
          </button>
        </div>
      </div>

      <div className="print-container">
        <div className="hidden print:block mb-8 border-b-2 border-slate-100 pb-6">
           <h2 className="text-2xl font-black uppercase italic tracking-tighter">AtriosWork</h2>
           <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Relatório de Comissões de Parceiros — {monthLabel}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 print:grid-cols-3">
          <div className="bg-slate-800/20 border border-amber-500/20 p-8 rounded-[2.5rem] relative overflow-hidden group print:border-black print:bg-white">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500 no-print"><DollarSign className="w-16 h-16" /></div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 print:text-black">Total Comissões</p>
            <p className="text-4xl font-black text-amber-500 tracking-tighter print:text-black">{f(totals.commission)}</p>
            <p className="text-[9px] font-bold text-slate-500 uppercase mt-2 no-print">Pronto para liquidação</p>
          </div>

          <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] relative overflow-hidden group print:border-black print:bg-white">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-white no-print"><ShoppingCart className="w-16 h-16" /></div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 print:text-black">Vendas na Rede</p>
            <p className="text-4xl font-black text-white tracking-tighter print:text-black">{totals.sales}</p>
          </div>

          <div className="bg-gradient-to-br from-amber-600/10 to-transparent border border-amber-500/20 p-8 rounded-[2.5rem] flex flex-col justify-center print:border-black print:bg-white">
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-5 h-5 text-amber-500 no-print" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black">Parceiro Top Mês</p>
            </div>
            <p className="text-xl font-black text-white uppercase italic truncate print:text-black">
              {reportData[0]?.salesCount > 0 ? reportData[0].name : "---"}
            </p>
          </div>
        </div>

        <div className="bg-slate-800/20 border border-slate-800 rounded-[2.5rem] overflow-hidden backdrop-blur-md shadow-2xl print:border-black print:rounded-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950/30 text-slate-500 text-[10px] uppercase font-black tracking-[0.2em] border-b border-slate-800 print:bg-slate-100 print:text-black">
                  <th className="px-10 py-6">Parceiro Vendedor</th>
                  <th className="px-6 py-6 text-center">Ativações</th>
                  <th className="px-6 py-6 text-center">Taxa Unit.</th>
                  <th className="px-6 py-6 text-right">Faturamento</th>
                  <th className="px-10 py-6 text-right text-amber-500 print:text-black">Comissão Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {filteredReports.length === 0 ? (
                  <tr><td colSpan={5} className="py-20 text-center text-slate-600 font-bold uppercase tracking-widest">Sem faturamento registado.</td></tr>
                ) : filteredReports.map((vendor: any) => (
                  <tr key={vendor.id} className="transition-all hover:bg-slate-800/40 group print:text-black">
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center font-black text-amber-500 uppercase print:border-black no-print">{vendor.name?.charAt(0)}</div>
                        <div>
                          <p className="font-bold text-white text-sm print:text-black">{vendor.name}</p>
                          <p className="text-[10px] font-mono text-slate-500 tracking-tighter">{vendor.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="font-bold text-white bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 print:text-black print:bg-white print:border-black">
                        {vendor.salesCount}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="text-xs font-black text-slate-400 print:text-black">{f(vendor.currentCommRate)}</span>
                    </td>
                    <td className="px-6 py-6 text-right">
                      <p className="text-white text-xs font-bold print:text-black">{f(vendor.totalRevenue)}</p>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <p className="text-lg font-black text-amber-500 print:text-black">{f(vendor.commissionAmount)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPartnerReports;
