import React, { useState } from 'react';
import { format, addMonths, subMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  DollarSign, 
  Wallet, 
  ShieldCheck, 
  PieChart as PieIcon, 
  Clock, 
  AlertCircle, 
  Zap, 
  CalendarCheck,
  TrendingUp,
  BarChart3,
  Briefcase,
  Coins
} from 'lucide-react';
import { UserProfile, WorkRecord, FinanceSummary } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface ExtendedFinanceSummary extends FinanceSummary {
  daysAbsent: number;
  partTimeHours: number;
  partTimeEarnings: number;
}

interface Props {
  user: UserProfile;
  records: Record<string, WorkRecord>;
  t: (key: string) => any;
  f: (value: number) => string;
  isPro?: boolean;
}

const FinancePage: React.FC<Props> = ({ user, records, t, f, isPro }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getAtriosWorkId = () => {
    try {
      const sub = user.subscription;
      if (!sub) return user.id?.substring(0, 8) || '---';
      if (typeof sub === 'object') return sub.id || user.id?.substring(0, 8) || '---';
      if (typeof sub === 'string') {
        const parsed = JSON.parse(sub);
        return parsed.id || user.id?.substring(0, 8) || '---';
      }
    } catch (e) { return user.id?.substring(0, 8) || '---'; }
    return user.id?.substring(0, 8) || '---';
  };

  const calculateFinance = (): ExtendedFinanceSummary => {
    let summary: ExtendedFinanceSummary = { 
      daysWorked: 0, 
      daysAbsent: 0,
      totalHours: 0, 
      totalExtraHours: 0, 
      extraHoursValue: 0, 
      socialSecurityTotal: 0, 
      irsTotal: 0, 
      advancesTotal: 0, 
      grossTotal: 0, 
      netTotal: 0, 
      ivaTotal: 0,
      partTimeHours: 0,
      partTimeEarnings: 0
    };
    
    const monthKey = format(currentDate, 'yyyy-MM');
    const monthRecords = (Object.entries(records) as [string, WorkRecord][]).filter(([date]) => date.startsWith(monthKey));
    
    let totalTravelPayment = 0;
    monthRecords.forEach(([_, record]) => {
      // Calcular horas e ganhos do Part-Time (independentemente de ausências no trabalho principal)
      const ptHours = record.partTimeHours || 0;
      const ptRate = record.partTimeRate || 10;
      const ptServiceVal = record.partTimeServiceValue || 0;
      const ptGross = (ptHours * ptRate) + ptServiceVal;
      const ptApplyIva = record.partTimeApplyIva || false;
      const ptIvaRate = record.partTimeIvaRate !== undefined ? record.partTimeIvaRate : 23;
      const ptIvaDeduction = ptApplyIva ? ptGross * (ptIvaRate / 100) : 0;
      
      summary.partTimeHours += ptHours;
      summary.partTimeEarnings += (ptGross - ptIvaDeduction);

      if (record.isAbsent) {
        summary.daysAbsent += 1;
        return;
      }
      
      summary.daysWorked += 1;
      const [hEntry, mEntry] = record.entry.split(':').map(Number);
      const [hExit, mExit] = record.exit.split(':').map(Number);
      let hours = (hExit + mExit/60) - (hEntry + mEntry/60);
      if (record.hasLunchBreak) hours -= 1;
      
      summary.totalHours += hours;
      summary.advancesTotal += record.advance;
      
      const extraH = record.extraHours.h1 + record.extraHours.h2 + record.extraHours.h3;
      summary.totalExtraHours += extraH;
      
      const rates = user.overtimeRates || { h1: 50, h2: 75, h3: 100 };
      const dailyExtraBonus = (record.extraHours.h1 * user.hourlyRate * ((rates.h1 ?? 50) / 100)) + 
                              (record.extraHours.h2 * user.hourlyRate * ((rates.h2 ?? 75) / 100)) + 
                              (record.extraHours.h3 * user.hourlyRate * ((rates.h3 ?? 100) / 100));

      const dailyExtraFullVal = (record.extraHours.h1 * user.hourlyRate * (1 + (rates.h1 ?? 50) / 100)) + 
                                (record.extraHours.h2 * user.hourlyRate * (1 + (rates.h2 ?? 75) / 100)) + 
                                (record.extraHours.h3 * user.hourlyRate * (1 + (rates.h3 ?? 100) / 100));
      
      summary.extraHoursValue += dailyExtraFullVal;
      const travelPay = record.travelPayment || 0;
      totalTravelPayment += travelPay;
      summary.grossTotal += (hours * user.hourlyRate) + dailyExtraFullVal + travelPay;
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

  const summary = calculateFinance();

  const chartData = [
    { name: 'Bruto Principal', value: summary.grossTotal, color: '#6366f1' },
    { name: 'Part-Time', value: summary.partTimeEarnings, color: '#a855f7' },
    { name: 'Impostos', value: summary.irsTotal + summary.socialSecurityTotal, color: '#f43f5e' },
    { name: 'Líquido Consolidado', value: summary.netTotal + summary.partTimeEarnings, color: '#10b981' }
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-32">
      {/* Header com Navegação Temporal */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">ATRIOSWORK<span className="text-purple-400">FINANCE</span></h2>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Monitorização de Performance Financeira — #{getAtriosWorkId()}</p>
        </div>
        <div className="flex items-center gap-2 glass px-4 py-2 rounded-[1.5rem] border-white/10">
           <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-white/10 rounded-xl transition-all"><ChevronLeft className="w-5 h-5 text-slate-400" /></button>
           <span className="text-xs font-black uppercase tracking-widest text-white min-w-[140px] text-center">{format(currentDate, 'MMMM yyyy', { locale: pt })}</span>
           <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-white/10 rounded-xl transition-all"><ChevronRight className="w-5 h-5 text-slate-400" /></button>
        </div>
      </div>

      {/* Hero Card: Rendimento Líquido Principal */}
      <div className="btn-primary rounded-[3rem] p-10 text-white relative overflow-hidden shadow-[0_20px_60px_rgba(99,102,241,0.3)]">
         <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none transform translate-x-10 -translate-y-10">
            <Wallet className="w-64 h-64" />
         </div>
         <div className="relative z-10 space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">Impacto Líquido na Carteira</p>
            </div>
            <h3 className="text-6xl font-black tracking-tighter">{f(summary.netTotal)}</h3>
            <div className="flex flex-wrap items-center gap-6 pt-6">
               <div className="flex items-center gap-2 text-white/60 text-[10px] font-black uppercase tracking-widest bg-black/20 px-4 py-2 rounded-full border border-white/5">
                  <CalendarCheck className="w-4 h-4 text-emerald-400" /> {summary.daysWorked} Dias de Trabalho
               </div>
               <div className="flex items-center gap-2 text-white/60 text-[10px] font-black uppercase tracking-widest bg-black/20 px-4 py-2 rounded-full border border-white/5">
                  <AlertCircle className="w-4 h-4 text-rose-400" /> {summary.daysAbsent} Faltas
               </div>
            </div>
         </div>
      </div>

      {/* Grid de Métricas Expandidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass p-8 rounded-[2.5rem] space-y-4 border-white/5 group hover:border-purple-500/30 transition-all overflow-hidden">
           <div className="flex justify-between items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate" title="Total de Horas Base">Total de Horas Base</span>
              <div className="p-3 rounded-2xl bg-slate-900 border border-white/5 shrink-0"><Clock className="w-5 h-5 text-purple-400" /></div>
           </div>
           <p className="text-3xl font-black text-white truncate w-full" title={`${summary.totalHours.toFixed(1)} Horas`}>{summary.totalHours.toFixed(1)} <span className="text-xs text-slate-500">Horas</span></p>
        </div>

        <div className="glass p-8 rounded-[2.5rem] space-y-4 border-white/5 group hover:border-emerald-500/30 transition-all relative overflow-hidden">
           <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Horas Extras Acumuladas</span>
              <div className="p-3 rounded-2xl bg-slate-900 border border-white/5"><Zap className="w-5 h-5 text-emerald-400" /></div>
           </div>
           <div className={!isPro ? "blur-md select-none" : ""}>
             <p className="text-3xl font-black text-white truncate w-full" title={`${summary.totalExtraHours} Extras`}>{summary.totalExtraHours} <span className="text-xs text-slate-500">Extras</span></p>
           </div>
           {!isPro && (
             <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]">
               <div className="bg-amber-500/20 border border-amber-500/30 px-4 py-2 rounded-full flex items-center gap-2">
                 <ShieldCheck className="w-3 h-3 text-amber-500" />
                 <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">AtriosWork PRO</span>
               </div>
             </div>
           )}
        </div>

        <div className="glass p-8 rounded-[2.5rem] space-y-4 border-white/5 group hover:border-indigo-500/30 transition-all relative overflow-hidden">
           <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Valor das Horas Extras</span>
              <div className="p-3 rounded-2xl bg-slate-900 border border-white/5"><DollarSign className="w-5 h-5 text-indigo-400" /></div>
           </div>
           <div className={!isPro ? "blur-md select-none" : ""}>
             <p className="text-3xl font-black text-white truncate w-full" title={f(summary.extraHoursValue)}>{f(summary.extraHoursValue)}</p>
           </div>
           {!isPro && (
             <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]">
               <div className="bg-amber-500/20 border border-amber-500/30 px-4 py-2 rounded-full flex items-center gap-2">
                 <ShieldCheck className="w-3 h-3 text-amber-500" />
                 <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">AtriosWork PRO</span>
               </div>
             </div>
           )}
        </div>

        <div className="glass p-8 rounded-[2.5rem] space-y-4 border-white/5 group hover:border-slate-500 transition-all">
           <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rendimento Bruto</span>
              <div className="p-3 rounded-2xl bg-slate-900 border border-white/5"><DollarSign className="w-5 h-5 text-slate-300" /></div>
           </div>
           <p className="text-3xl font-black text-white truncate w-full" title={f(summary.grossTotal)}>{f(summary.grossTotal)}</p>
        </div>

        <div className="glass p-8 rounded-[2.5rem] space-y-4 border-white/5 group hover:border-rose-500/30 transition-all">
           <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total de Impostos</span>
              <div className="p-3 rounded-2xl bg-slate-900 border border-white/5"><ShieldCheck className="w-5 h-5 text-rose-500" /></div>
           </div>
           <p className="text-3xl font-black text-rose-500 truncate w-full" title={f(summary.irsTotal + summary.socialSecurityTotal)}>{f(summary.irsTotal + summary.socialSecurityTotal)}</p>
        </div>

        <div className="glass p-8 rounded-[2.5rem] space-y-4 border-white/5 group hover:border-amber-500/30 transition-all">
           <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vales Deduzidos</span>
              <div className="p-3 rounded-2xl bg-slate-900 border border-white/5"><AlertCircle className="w-5 h-5 text-amber-500" /></div>
           </div>
           <p className="text-3xl font-black text-amber-500 truncate w-full" title={f(summary.advancesTotal)}>{f(summary.advancesTotal)}</p>
        </div>

        <div className="glass p-8 rounded-[2.5rem] space-y-4 border-white/5 group hover:border-purple-500/30 transition-all flex flex-col justify-between">
           <div className="space-y-4">
             <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rendimento Part-Time</span>
                <div className="p-3 rounded-2xl bg-slate-900 border border-white/5"><Briefcase className="w-5 h-5 text-purple-400" /></div>
             </div>
             <p className="text-3xl font-black text-purple-400 truncate w-full" title={f(summary.partTimeEarnings)}>{f(summary.partTimeEarnings)}</p>
           </div>
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">{summary.partTimeHours.toFixed(1)}h extra dedicadas</p>
        </div>

        <div className="glass p-8 rounded-[2.5rem] space-y-4 border-white/5 group hover:border-emerald-500/30 transition-all flex flex-col justify-between">
           <div className="space-y-4">
             <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Líquido Consolidado</span>
                <div className="p-3 rounded-2xl bg-slate-900 border border-white/5"><Coins className="w-5 h-5 text-emerald-400" /></div>
             </div>
             <p className="text-3xl font-black text-emerald-400 truncate w-full" title={f(summary.netTotal + summary.partTimeEarnings)}>{f(summary.netTotal + summary.partTimeEarnings)}</p>
           </div>
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2 font-black">Principal + Part-Time</p>
        </div>
      </div>

      {/* Gráfico de Barras e Detalhamento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass rounded-[3rem] p-10 space-y-8 border-white/5">
           <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-purple-400" /> Composição Mensal
              </h3>
           </div>
           <div className="h-[300px] w-full mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} 
                  />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px' }}
                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="value" radius={[12, 12, 12, 12]} barSize={40}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        <div className="glass rounded-[3rem] p-10 space-y-8 border-white/5">
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
            <PieIcon className="w-5 h-5 text-purple-400" /> Detalhamento de Deduções
          </h3>
          <div className="space-y-6">
             <div className="flex justify-between items-center py-4 border-b border-white/5">
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Imposto de Renda (IRS)</p>
                   <p className="text-xs text-slate-300">Baseado na taxa configurada no perfil</p>
                </div>
                <span className="text-lg font-black text-rose-500">-{f(summary.irsTotal)}</span>
             </div>
             <div className="flex justify-between items-center py-4 border-b border-white/5">
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Segurança Social</p>
                   <p className="text-xs text-slate-300">Contribuição obrigatória do trabalhador</p>
                </div>
                <span className="text-lg font-black text-rose-500">-{f(summary.socialSecurityTotal)}</span>
             </div>
             {user.isFreelancer && (
               <div className="flex justify-between items-center py-4 border-b border-white/5">
                  <div className="space-y-1">
                     <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">IVA Recuperável</p>
                     <p className="text-xs text-slate-300">Regime de prestação de serviços</p>
                  </div>
                  <span className="text-lg font-black text-emerald-400">+{f(summary.ivaTotal)}</span>
               </div>
             )}
             <div className="flex justify-between items-center py-4">
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Vales e Antecipações</p>
                   <p className="text-xs text-slate-300">Total debitado durante o mês</p>
                </div>
                <span className="text-lg font-black text-amber-500">-{f(summary.advancesTotal)}</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancePage;