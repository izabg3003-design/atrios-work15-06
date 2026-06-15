import React, { useState } from 'react';
import { FileText, Calendar, ArrowLeft, HardDrive, Coffee, FileDown, LayoutList, ClipboardList, Clock } from 'lucide-react';
import { UserProfile, WorkRecord, FinanceSummary } from '../types';
import { format, parseISO } from 'date-fns';
import { pt, enUS, es, fr, de, it } from 'date-fns/locale';

interface Props {
  user: UserProfile;
  records: Record<string, WorkRecord>;
  t: (key: string) => any;
  f: (value: number) => string;
  isPro?: boolean;
}

const ReportsPage: React.FC<Props> = ({ user, records, t, f, isPro }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  
  const lang = user.settings?.language || 'pt-PT';
  const locales: Record<string, any> = { 'pt-PT': pt, 'en': enUS, 'es-ES': es, 'es-AR': es, 'fr': fr, 'de': de, 'it': it };
  const currentLocale = locales[lang] || pt;

  const getAtriosWorkId = () => {
    try {
      const sub = user.subscription;
      if (!sub) return user.id?.substring(0, 8) || '---';
      const parsed = typeof sub === 'string' ? JSON.parse(sub) : sub;
      return parsed.id || user.id?.substring(0, 8) || '---';
    } catch (e) { return user.id?.substring(0, 8) || '---'; }
  };

  const calculateMonthSummary = (monthRecords: WorkRecord[]): FinanceSummary => {
    let summary: FinanceSummary = { 
      daysWorked: 0, 
      totalHours: 0, 
      totalExtraHours: 0, 
      extraHoursValue: 0, 
      socialSecurityTotal: 0, 
      irsTotal: 0, 
      advancesTotal: 0, 
      grossTotal: 0, 
      netTotal: 0, 
      ivaTotal: 0,
      totalTravelHours: 0,
      totalTravelPayment: 0
    };
    monthRecords.forEach(record => {
      if (record.isAbsent) return;
      summary.daysWorked++;
      const [hEntry, mEntry] = record.entry.split(':').map(Number);
      const [hExit, mExit] = record.exit.split(':').map(Number);
      let hours = (hExit + mExit/60) - (hEntry + mEntry/60);
      if (record.hasLunchBreak) hours -= 1;
      summary.totalHours += hours;
      summary.advancesTotal += record.advance;
      
      const travelH = record.travelHours || 0;
      const travelPay = record.travelPayment || 0;
      summary.totalTravelHours = (summary.totalTravelHours || 0) + travelH;
      summary.totalTravelPayment = (summary.totalTravelPayment || 0) + travelPay;

      const h1 = record.extraHours?.h1 || 0;
      const h2 = record.extraHours?.h2 || 0;
      const h3 = record.extraHours?.h3 || 0;
      const rates = user.overtimeRates || { h1: 50, h2: 75, h3: 100 };
      const dailyExtraBonus = (h1 * user.hourlyRate * ((rates.h1 ?? 50) / 100)) + 
                              (h2 * user.hourlyRate * ((rates.h2 ?? 75) / 100)) + 
                              (h3 * user.hourlyRate * ((rates.h3 ?? 100) / 100));
      summary.totalExtraHours += (h1 + h2 + h3);
      summary.extraHoursValue += dailyExtraBonus;
      summary.grossTotal += (hours * user.hourlyRate) + dailyExtraBonus + travelPay;
    });

    const calcTax = (base: number, config: { value: number; type: 'percentage' | 'fixed' }) => config.type === 'percentage' ? (base * config.value) / 100 : config.value;
    
    const taxableBase = Math.max(0, summary.grossTotal - (summary.totalTravelPayment || 0));

    if (!user.isFreelancer) {
      summary.socialSecurityTotal = calcTax(taxableBase, user.socialSecurity);
      summary.irsTotal = calcTax(taxableBase, user.irs);
    } else {
      summary.ivaTotal = calcTax(taxableBase, user.vat);
    }
    summary.netTotal = summary.grossTotal - summary.socialSecurityTotal - summary.irsTotal - summary.advancesTotal + (user.isFreelancer ? summary.ivaTotal : 0);
    return summary;
  };

  const triggerPDFExport = (monthKey: string) => {
    if (!isPro) {
      alert("Download de PDF bloqueado na versão gratuita. Ative a sua licença PRO para exportar relatórios.");
      return;
    }
    const monthName = format(parseISO(`${monthKey}-01`), 'MMMM_yyyy', { locale: currentLocale });
    const originalTitle = document.title;
    document.title = `ATRIOSWORK_REPORT_${user.name.replace(/\s+/g, '_').toUpperCase()}_${getAtriosWorkId()}_${monthName.toUpperCase()}`;
    setTimeout(() => {
      window.print();
      document.title = originalTitle;
    }, 500);
  };

  const monthsData = Object.keys(records).reduce((acc, date) => {
    const monthKey = date.substring(0, 7);
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(records[date]);
    return acc;
  }, {} as Record<string, WorkRecord[]>);

  if (viewMode === 'detail' && selectedMonth) {
    const monthRecordsEntries = (Object.entries(records) as [string, WorkRecord][])
      .filter(([d]) => d.startsWith(selectedMonth))
      .sort(([a],[b]) => a.localeCompare(b));
    const summary = calculateMonthSummary(monthRecordsEntries.map(([_, r]) => r));

    return (
      <div className="space-y-6 md:space-y-8 animate-[fadeIn_0.4s_ease-out] pb-40 px-2 md:px-0">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 no-print">
          <button onClick={() => setViewMode('list')} className="flex items-center justify-center gap-3 text-slate-400 hover:text-white transition-all group px-6 py-4 bg-slate-800/20 border border-white/5 rounded-2xl md:rounded-xl">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-2" />
            <span className="text-[10px] font-black uppercase tracking-widest">Voltar Arquivo</span>
          </button>
          <button onClick={() => triggerPDFExport(selectedMonth)} className="flex items-center justify-center gap-3 px-8 py-5 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl text-[11px] uppercase tracking-widest shadow-xl transition-all">
            <FileDown className="w-5 h-5" /> Exportar Relatório PDF
          </button>
        </div>

        <div className="bg-white text-slate-900 rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl print-container print:rounded-none">
          <div className="p-8 md:p-12 print:p-8">
            {/* CABEÇALHO */}
            <div className="flex flex-col md:flex-row justify-between items-start border-b border-slate-100 pb-8 mb-8 gap-6 print:border-black print:pb-6">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200 overflow-hidden no-print">
                   <img src={user.photo || "https://ui-avatars.com/api/?name="+user.name} className="w-full h-full object-cover" alt={user.name} />
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter uppercase text-slate-900 leading-none">
                    {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: currentLocale })}
                  </h3>
                  <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mt-2">AtriosWork • ID #{getAtriosWorkId()}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Documento Gerado em</p>
                <p className="text-xs font-bold text-slate-900">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                <div className="mt-3 px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[8px] font-black uppercase inline-block">Integridade Verificada</div>
              </div>
            </div>

            {/* BLOCO FISCAL NO TOPO */}
            <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2rem] print:bg-white print:border-black print:p-6 mb-8">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Informação Profissional e Fiscal (Portugal)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                  <div><p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Colaborador</p><p className="text-xs font-black text-slate-900">{user.name}</p></div>
                  <div><p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">NIF (Contribuinte)</p><p className="text-xs font-black text-slate-900">{user.nif || '---'}</p></div>
                  <div><p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Base Hora</p><p className="text-xs font-black text-slate-900">{f(user.hourlyRate)}</p></div>
                  <div><p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p><p className="text-xs font-black text-emerald-600 uppercase">{user.isFreelancer ? 'Recibos Verdes' : 'Contrato de Trabalho'}</p></div>
                </div>
            </div>

            {/* TOTAIS MENSAIS */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-10 print:grid-cols-7">
              {[
                { label: 'Bruto', val: f(summary.grossTotal), color: 'text-slate-900' },
                { label: 'Adiantamentos', val: f(summary.advancesTotal), color: 'text-amber-600' },
                { label: 'Retenções (IRS/SS)', val: f(summary.irsTotal + summary.socialSecurityTotal), color: 'text-red-600' },
                { label: 'Extras', val: `+${summary.totalExtraHours}h`, color: 'text-purple-600' },
                { label: 'Percurso', val: `${summary.totalTravelHours || 0}h`, color: 'text-blue-600' },
                { label: 'Pagamento Percurso', val: f(summary.totalTravelPayment || 0), color: 'text-emerald-600' },
                { label: 'Líquido Final', val: f(summary.netTotal), color: 'text-emerald-700', highlight: true },
              ].map((item, i) => (
                <div key={i} className={`p-4 sm:p-5 rounded-2xl border overflow-hidden flex flex-col justify-between min-h-[90px] ${item.highlight ? 'bg-emerald-50 border-emerald-200 shadow-sm col-span-2 lg:col-span-1' : 'bg-slate-50 border-slate-100'} print:border-black print:bg-white`}>
                  <p className="text-[7.5px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1 truncate block" title={item.label}>{item.label}</p>
                  <p className={`text-base sm:text-lg md:text-xl font-black ${item.color} print:text-black truncate block w-full`} title={item.val}>{item.val}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="print-page-break"></div>

          <div className="p-8 md:p-12 print:p-8">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-3">
              <ClipboardList className="w-4 h-4" /> Detalhamento Operacional de Registos (Ledger PT)
            </h4>
            
            <div className="border border-slate-200 rounded-3xl overflow-x-auto no-scrollbar print:overflow-visible print:border-black print:rounded-none">
              <table className="w-full text-left text-[11px] border-collapse min-w-[1100px] md:min-w-full print:min-w-full print:text-[6.2pt]">
                <thead className="bg-slate-50 text-slate-500 font-black uppercase border-b border-slate-200 print:bg-slate-100 print:text-black print:border-black">
                  <tr>
                    <th className="px-3 py-4 w-[7%]">Data</th>
                    <th className="px-2 py-4 text-center w-[8%]">Horário</th>
                    <th className="px-1 py-4 text-center w-[3%]">Alm</th>
                    <th className="px-2 py-4 text-center w-[5%]">Horas</th>
                    <th className="px-3 py-4 w-[9%]">Localização</th>
                    <th className="px-2 py-4 text-center w-[6%]">Adiant.</th>
                    <th className="px-2 py-4 text-center w-[6%]">Extras</th>
                    <th className="px-2 py-4 text-center w-[6%]">Percurso</th>
                    <th className="px-2 py-4 text-center w-[8%]">Pag. Perc.</th>
                    <th className="px-2 py-4 text-right w-[8%] text-red-600 print:text-black">IRS</th>
                    <th className="px-2 py-4 text-right w-[8%] text-blue-600 print:text-black">S.S.</th>
                    <th className="px-2 py-4 text-right w-[8%]">Bruto</th>
                    <th className="px-2 py-4 text-right w-[10%] font-black text-emerald-600 print:text-black">Líquido</th>
                    <th className="px-3 py-4 w-[10%]">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                  {monthRecordsEntries.map(([date, record]) => {
                    const [hEntry, mEntry] = record.entry.split(':').map(Number);
                    const [hExit, mExit] = record.exit.split(':').map(Number);
                    let hours = (hExit + mExit/60) - (hEntry + mEntry/60);
                    if (record.hasLunchBreak) hours -= 1;
                    
                    const h1 = record.extraHours?.h1 || 0;
                    const h2 = record.extraHours?.h2 || 0;
                    const h3 = record.extraHours?.h3 || 0;
                    const rates = user.overtimeRates || { h1: 50, h2: 75, h3: 100 };
                    const dailyExtraBonus = (h1 * user.hourlyRate * ((rates.h1 ?? 50) / 100)) + 
                                            (h2 * user.hourlyRate * ((rates.h2 ?? 75) / 100)) + 
                                            (h3 * user.hourlyRate * ((rates.h3 ?? 100) / 100));
                    
                    const travelH = record.travelHours || 0;
                    const travelPay = record.travelPayment || 0;
                    const rowGross = record.isAbsent ? 0 : (hours * user.hourlyRate) + dailyExtraBonus + travelPay;
                    const taxableRowGross = record.isAbsent ? 0 : (hours * user.hourlyRate) + dailyExtraBonus;
                    
                    // Cálculo de Retenções e Líquido Diário
                    const calcTaxRow = (base: number, config: { value: number; type: 'percentage' | 'fixed' }) => 
                      config.type === 'percentage' ? (base * config.value) / 100 : (config.value / summary.daysWorked);

                    const rowIRS = record.isAbsent ? 0 : calcTaxRow(taxableRowGross, user.irs);
                    const rowSS = record.isAbsent ? 0 : calcTaxRow(taxableRowGross, user.socialSecurity);
                    const rowNet = rowGross - rowIRS - rowSS - (record.advance || 0);

                    return (
                      <tr key={date} className={`${record.isAbsent ? 'bg-red-50' : 'hover:bg-slate-50/30'} print:text-black`}>
                        <td className="px-3 py-3 font-black text-slate-900 print:text-black">{format(parseISO(date), 'dd/MM/yy')}</td>
                        <td className="px-2 py-3 text-center">
                          {record.isAbsent ? <span className="text-red-600 font-bold uppercase text-[8px]">Falta</span> : <span className="text-slate-700">{record.entry}-{record.exit}</span>}
                        </td>
                        <td className="px-1 py-3 text-center">
                          {record.hasLunchBreak ? <Coffee className="w-3 h-3 mx-auto text-emerald-600/50" /> : <span className="text-slate-300">---</span>}
                        </td>
                        <td className="px-2 py-3 text-center font-bold text-slate-600">
                          {!record.isAbsent ? `${hours.toFixed(1)}h` : '-'}
                        </td>
                        <td className="px-3 py-3 truncate text-slate-600">{record.location || '---'}</td>
                        <td className="px-2 py-3 text-center font-bold text-amber-600 print:text-black">
                          {record.advance > 0 ? f(record.advance) : '-'}
                        </td>
                        <td className="px-2 py-3 text-center font-black text-purple-600 print:text-black">
                          { (h1 + h2 + h3) > 0 ? `+${h1 + h2 + h3}h` : '-' }
                        </td>
                        <td className="px-2 py-3 text-center font-black text-blue-600 print:text-black">
                          { travelH > 0 ? `${travelH}h` : '-' }
                        </td>
                        <td className="px-2 py-3 text-center font-bold text-emerald-600 print:text-black">
                          { travelPay > 0 ? f(travelPay) : '-' }
                        </td>
                        <td className="px-2 py-3 text-right text-red-500 font-medium">
                          {rowIRS > 0 ? `-${f(rowIRS)}` : '-'}
                        </td>
                        <td className="px-2 py-3 text-right text-blue-500 font-medium">
                          {rowSS > 0 ? `-${f(rowSS)}` : '-'}
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-slate-900 print:text-black">
                          {!record.isAbsent ? f(rowGross) : '-'}
                        </td>
                        <td className="px-2 py-3 text-right font-black text-emerald-600 print:text-black">
                          {!record.isAbsent ? f(rowNet) : '-'}
                        </td>
                        <td className="px-3 py-3 text-[8.5px] italic text-slate-400 print:text-black leading-tight">{record.notes || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 text-slate-900 font-black uppercase text-[8px] border-t-2 border-slate-200 print:bg-white print:text-black print:text-[6.5pt] print:border-black">
                  <tr>
                    <td className="px-3 py-5">Totais</td>
                    <td className="px-3 py-5"></td>
                    <td className="px-3 py-5"></td>
                    <td className="px-2 py-5 text-center text-slate-500 font-bold">{summary.totalHours.toFixed(1)}h</td>
                    <td className="px-3 py-5"></td>
                    <td className="px-2 py-5 text-center text-amber-600">{f(summary.advancesTotal)}</td>
                    <td className="px-2 py-5 text-center text-purple-600">+{summary.totalExtraHours}h</td>
                    <td className="px-2 py-5 text-center text-blue-600">{(summary.totalTravelHours || 0).toFixed(1)}h</td>
                    <td className="px-2 py-5 text-center text-emerald-600">{f(summary.totalTravelPayment || 0)}</td>
                    <td className="px-2 py-5 text-right text-red-600">{f(summary.irsTotal)}</td>
                    <td className="px-2 py-5 text-right text-blue-600">{f(summary.socialSecurityTotal)}</td>
                    <td className="px-2 py-5 text-right">{f(summary.grossTotal)}</td>
                    <td className="px-2 py-5 text-right font-black text-slate-900">{f(summary.netTotal)}</td>
                    <td className="px-3 py-5 text-right"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 print:border-black print:mt-10">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]">AtriosWork Infrastructure v16.0 — Auditoria Digital Europeia</p>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] print:text-black">AtriosWork © 2026</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sortedMonths = Object.entries(monthsData).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] no-print pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black italic tracking-tighter uppercase text-white">ATRIOSWORK<span className="text-purple-400">_REPORT</span></h2>
        <div className="hidden md:flex items-center gap-3 bg-slate-800/40 px-6 py-3 rounded-2xl border border-white/5">
           <HardDrive className="w-4 h-4 text-purple-400" />
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Cloud Sincronizada (Lisboa)</span>
        </div>
      </div>

      {sortedMonths.length === 0 ? (
        <div className="bg-slate-800/10 border-2 border-dashed border-slate-800 rounded-[3rem] p-20 flex flex-col items-center text-center space-y-4">
          <FileText className="w-16 h-16 text-slate-700" />
          <h3 className="text-xl font-black text-slate-500 uppercase tracking-tighter italic">Nenhum Relatório Disponível</h3>
        </div>
      ) : (
        <div className="bg-slate-800/20 border border-slate-800 rounded-[2.5rem] overflow-hidden backdrop-blur-md">
           <div className="p-8 border-b border-slate-800 bg-slate-900/40">
              <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
                <LayoutList className="w-5 h-5 text-purple-400" /> Arquivos Mensais Disponíveis
              </h3>
           </div>
           <div className="divide-y divide-slate-800/40">
              {sortedMonths.map(([monthKey, monthRecords]) => {
                const summary = calculateMonthSummary(monthRecords);
                return (
                  <div key={monthKey} className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 md:p-8 hover:bg-slate-800/40 transition-all gap-4">
                    <div className="flex items-center gap-4 md:gap-6">
                      <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-center shrink-0">
                         <Calendar className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
                      </div>
                      <div>
                        <h4 className="text-base md:text-lg font-black text-white capitalize italic tracking-tight">{format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: currentLocale })}</h4>
                        <p className="text-[9px] md:text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">{summary.daysWorked} Dias Trabalhados • {f(summary.netTotal)} Líquidos</p>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedMonth(monthKey); setViewMode('detail'); window.scrollTo(0,0); }} className="w-full md:w-auto px-6 py-4 bg-slate-950 border border-slate-800 rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-white/20 transition-all">
                      Ver Detalhes do Mês
                    </button>
                  </div>
                );
              })}
           </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;