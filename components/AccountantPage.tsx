import React, { useState, useMemo } from 'react';
import { format, endOfYear, eachMonthOfInterval, startOfYear } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Printer, User as UserIcon, Building2 } from 'lucide-react';
import { UserProfile, WorkRecord, FinanceSummary } from '../types';

interface Props {
  user: UserProfile;
  records: Record<string, WorkRecord>;
  t: (key: string) => any;
  f: (value: number) => string;
  isPro?: boolean;
}

const AccountantPage: React.FC<Props> = ({ user, records, t, f, isPro }) => {
  const [selectedYear] = useState(new Date().getFullYear());

  const handlePrint = () => {
    if (!isPro) {
      alert("Download de PDF bloqueado na versão gratuita. Ative a sua licença PRO para exportar declarações.");
      return;
    }
    window.print();
  };

  const calculateMonthSummary = (monthRecords: WorkRecord[]): FinanceSummary => {
    let summary: FinanceSummary = { 
      daysWorked: 0, totalHours: 0, totalExtraHours: 0, extraHoursValue: 0, 
      socialSecurityTotal: 0, irsTotal: 0, advancesTotal: 0, grossTotal: 0, 
      netTotal: 0, ivaTotal: 0, totalTravelHours: 0, totalTravelPayment: 0
    };

    let totalTravelPayment = 0;
    monthRecords.forEach(record => {
      if (record.isAbsent) return;
      summary.daysWorked++;
      const [hEntry, mEntry] = record.entry.split(':').map(Number);
      const [hExit, mExit] = record.exit.split(':').map(Number);
      let hours = (hExit + mExit/60) - (hEntry + mEntry/60);
      if (record.hasLunchBreak) hours -= 1;
      summary.totalHours += hours;
      summary.advancesTotal += record.advance || 0;
      
      const rate = user.hourlyRate || 10;
      const h1 = record.extraHours?.h1 || 0;
      const h2 = record.extraHours?.h2 || 0;
      const h3 = record.extraHours?.h3 || 0;
      
      const rates = user.overtimeRates || { h1: 50, h2: 75, h3: 100 };
      const dailyExtraBonus = (h1 * rate * ((rates.h1 ?? 50) / 100)) + 
                              (h2 * rate * ((rates.h2 ?? 75) / 100)) + 
                              (h3 * rate * ((rates.h3 ?? 100) / 100));
      
      summary.totalExtraHours += (h1 + h2 + h3);
      summary.extraHoursValue += dailyExtraBonus;
      const travelPay = record.travelPayment || 0;
      totalTravelPayment += travelPay;
      // grossTotal aqui representa o somatório de (horas base * rate) + bónus extras + percurso
      summary.grossTotal += (hours * rate) + dailyExtraBonus + travelPay;
    });

    const calcTax = (base: number, config: { value: number; type: 'percentage' | 'fixed' }) => 
      config.type === 'percentage' ? (base * config.value) / 100 : config.value;

    const taxableBase = Math.max(0, summary.grossTotal - totalTravelPayment);

    if (!user.isFreelancer) {
      summary.socialSecurityTotal = calcTax(taxableBase, user.socialSecurity);
      summary.irsTotal = calcTax(taxableBase, user.irs);
    } else {
      summary.ivaTotal = calcTax(taxableBase, user.vat);
    }
    
    summary.netTotal = summary.grossTotal - summary.socialSecurityTotal - summary.irsTotal - summary.advancesTotal + (user.isFreelancer ? summary.ivaTotal : 0);
    return summary;
  };

  const reportData = useMemo(() => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const months = eachMonthOfInterval({ start: yearStart, end: endOfYear(yearStart) });
    
    const monthlyData = months.map(month => {
      const monthKey = format(month, 'yyyy-MM');
      const monthRecords = (Object.entries(records) as [string, WorkRecord][])
        .filter(([d]) => d.startsWith(monthKey))
        .map(([_, r]) => r);
      
      return { 
        monthName: format(month, 'MMMM', { locale: pt }), 
        summary: calculateMonthSummary(monthRecords) 
      };
    });

    const totals = monthlyData.reduce((acc, curr) => ({
      gross: acc.gross + curr.summary.grossTotal,
      extras: acc.extras + curr.summary.extraHoursValue,
      net: acc.net + curr.summary.netTotal,
      irs: acc.irs + curr.summary.irsTotal,
      ss: acc.ss + curr.summary.socialSecurityTotal,
      iva: acc.iva + curr.summary.ivaTotal,
      advances: acc.advances + curr.summary.advancesTotal,
    }), { gross: 0, extras: 0, net: 0, irs: 0, ss: 0, iva: 0, advances: 0 });

    return { monthlyData, totals };
  }, [selectedYear, records, user]);

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] pb-32">
      <div className="flex justify-between items-center no-print">
        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">ATRIOSWORK<span className="text-green-400">_LEDGER</span></h2>
        <button onClick={handlePrint} className="bg-green-600 hover:bg-green-500 text-slate-950 font-black px-6 py-3 rounded-xl flex items-center gap-2 text-[10px] uppercase tracking-widest transition-all">
          <Printer className="w-4 h-4" /> Descarregar PDF (A4)
        </button>
      </div>

      <div className="bg-white text-slate-900 p-8 md:p-12 rounded-[3rem] shadow-2xl print-container print:rounded-none">
        <header className="flex flex-col md:flex-row justify-between items-start border-b border-slate-100 pb-8 mb-10 gap-6 print:border-black">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black text-xs">AW</div>
              <div>
                <h1 className="font-black text-xl uppercase tracking-tighter leading-none">AtriosWork</h1>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Infraestrutura Contabilística v16.0</p>
              </div>
            </div>
            <div className="pt-4">
              <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">Declaração Anual de Rendimentos</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Referência: {selectedYear}</p>
            </div>
          </div>
          
          <div className="bg-slate-50 border border-slate-100 p-6 rounded-[2rem] flex items-center gap-4 print:border-black">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
              <UserIcon className="w-6 h-6 text-slate-300" />
            </div>
            <div>
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Contribuinte Registado</p>
              <p className="text-sm font-black uppercase text-slate-900">{user.name}</p>
              <div className="flex gap-4 mt-2">
                <div>
                  <p className="text-[6px] font-black text-slate-400 uppercase">NIF Fiscal</p>
                  <p className="text-[10px] font-bold text-slate-800">{user.nif || '---'}</p>
                </div>
                <div>
                  <p className="text-[6px] font-black text-slate-400 uppercase">Status</p>
                  <p className="text-[10px] font-black text-emerald-600 uppercase">{user.isFreelancer ? 'Recibos Verdes' : 'Contrato de Trabalho'}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* CARTÕES DE RESUMO SUPERIORES */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-12">
           <div className="bg-slate-50 p-4 sm:p-5 rounded-[2rem] border border-slate-100 print:border-black overflow-hidden flex flex-col justify-between min-h-[90px]">
             <p className="text-[7.5px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1 truncate block" title="Bruto Total">Bruto Total</p>
             <p className="text-base sm:text-lg md:text-xl font-black text-slate-900 truncate block w-full" title={f(reportData.totals.gross)}>{f(reportData.totals.gross)}</p>
           </div>
           <div className="bg-red-50 p-4 sm:p-5 rounded-[2rem] border border-red-100 print:border-black overflow-hidden flex flex-col justify-between min-h-[90px]">
             <p className="text-[7.5px] font-black text-red-500 uppercase tracking-[0.1em] mb-1 truncate block" title="IRS Retido">IRS Retido</p>
             <p className="text-base sm:text-lg md:text-xl font-black text-red-600 truncate block w-full" title={`-${f(reportData.totals.irs)}`}>-{f(reportData.totals.irs)}</p>
           </div>
           <div className="bg-blue-50 p-4 sm:p-5 rounded-[2rem] border border-blue-100 print:border-black overflow-hidden flex flex-col justify-between min-h-[90px]">
             <p className="text-[7.5px] font-black text-blue-500 uppercase tracking-[0.1em] mb-1 truncate block" title="Seg. Social">Seg. Social</p>
             <p className="text-base sm:text-lg md:text-xl font-black text-blue-600 truncate block w-full" title={`-${f(reportData.totals.ss)}`}>-{f(reportData.totals.ss)}</p>
           </div>
           <div className="bg-amber-50 p-4 sm:p-5 rounded-[2rem] border border-amber-100 print:border-black overflow-hidden flex flex-col justify-between min-h-[90px]">
             <p className="text-[7.5px] font-black text-amber-500 uppercase tracking-[0.1em] mb-1 truncate block" title="Adiantamentos">Adiantamentos</p>
             <p className="text-base sm:text-lg md:text-xl font-black text-amber-600 truncate block w-full" title={`-${f(reportData.totals.advances)}`}>-{f(reportData.totals.advances)}</p>
           </div>
           <div className="bg-emerald-50 p-4 sm:p-5 rounded-[2rem] border-2 border-emerald-500/20 col-span-2 lg:col-span-1 print:border-black overflow-hidden flex flex-col justify-between min-h-[90px]">
             <p className="text-[7.5px] font-black text-emerald-700 uppercase tracking-[0.1em] mb-1 truncate block" title="Rendimento Líquido">Rendimento Líquido</p>
             <p className="text-base sm:text-lg md:text-xl font-black text-emerald-700 truncate block w-full" title={f(reportData.totals.net)}>{f(reportData.totals.net)}</p>
           </div>
        </div>

        {/* TABELA DE RENDIMENTOS */}
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left text-[11px] border-collapse min-w-[800px] print:min-w-full">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-black uppercase border-b border-slate-100 print:border-black">
                <th className="px-6 py-5">Mês</th>
                <th className="px-6 py-5 text-center">Bruto Total</th>
                <th className="px-6 py-5 text-center text-purple-600">Bónus Extras</th>
                <th className="px-6 py-5 text-center text-red-500">IRS</th>
                <th className="px-6 py-5 text-center text-blue-500">S.S.</th>
                <th className="px-6 py-5 text-center text-amber-600">Vales</th>
                <th className="px-6 py-5 text-right font-black text-slate-900">Líquido Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 print:divide-slate-200">
              {reportData.monthlyData.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-6 py-4 font-black capitalize text-slate-900">{m.monthName}</td>
                  <td className="px-6 py-4 text-center font-bold text-slate-900">{f(m.summary.grossTotal - m.summary.extraHoursValue)}</td>
                  <td className="px-6 py-4 text-center font-black text-purple-500">+{f(m.summary.extraHoursValue)}</td>
                  <td className="px-6 py-4 text-center text-red-500 font-bold">-{f(m.summary.irsTotal)}</td>
                  <td className="px-6 py-4 text-center text-blue-500 font-bold">-{f(m.summary.socialSecurityTotal)}</td>
                  <td className="px-6 py-4 text-center text-amber-600 font-bold">-{f(m.summary.advancesTotal)}</td>
                  <td className="px-6 py-4 text-right font-black text-slate-900">{f(m.summary.netTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="print:table-footer-group">
              <tr className="bg-slate-900 text-white font-black uppercase text-[10px] print:bg-white print:text-black print:border-t-2 print:border-black">
                <td className="px-6 py-6 rounded-bl-[2rem] print:rounded-none">Totais Acumulados</td>
                <td className="px-6 py-6 text-center text-white font-bold print:text-black">{f(reportData.totals.gross - reportData.totals.extras)}</td>
                <td className="px-6 py-6 text-center text-purple-400">+{f(reportData.totals.extras)}</td>
                <td className="px-6 py-6 text-center text-red-400">-{f(reportData.totals.irs)}</td>
                <td className="px-6 py-6 text-center text-blue-400">-{f(reportData.totals.ss)}</td>
                <td className="px-6 py-6 text-center text-amber-400">-{f(reportData.totals.advances)}</td>
                <td className="px-6 py-6 text-right rounded-br-[2rem] text-emerald-400 print:rounded-none print:text-black">{f(reportData.totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <footer className="mt-16 pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 opacity-40 print:opacity-100 print:border-black print:mt-12">
          <div className="flex items-center gap-3">
            <Building2 className="w-4 h-4" />
            <p className="text-[7px] font-black uppercase tracking-[0.2em]">Auditoria Certificada AtriosWork Portugal • v16.0.4</p>
          </div>
          <div className="text-[7px] font-bold uppercase tracking-[0.4em]">AtriosWork — Lisboa 2026</div>
        </footer>
      </div>
    </div>
  );
};

export default AccountantPage;