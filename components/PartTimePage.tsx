import React, { useState, useMemo } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, addDays, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Coins, 
  Briefcase, 
  Plus, 
  Calendar, 
  AlertCircle,
  Save,
  CheckCircle2,
  Trash2,
  Bookmark,
  Sparkles,
  Search,
  Check,
  Smartphone,
  Notebook,
  DollarSign
} from 'lucide-react';
import { UserProfile, WorkRecord } from '../types';

interface Props {
  user: UserProfile;
  records: Record<string, WorkRecord>;
  t: (key: string) => any;
  f: (value: number) => string;
  isPro?: boolean;
  onOpenPremium?: () => void;
  onAddRecord: (record: WorkRecord) => Promise<boolean>;
}

const PartTimePage: React.FC<Props> = ({ user, records, t, f, isPro, onOpenPremium, onAddRecord }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Form State
  const [selectedDateStr, setSelectedDateStr] = useState(format(new Date(), 'yyyy-MM-dd'));

  const handlePrevDay = () => {
    try {
      const current = parseISO(selectedDateStr);
      if (!isNaN(current.getTime())) {
        const prev = subDays(current, 1);
        setSelectedDateStr(format(prev, 'yyyy-MM-dd'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNextDay = () => {
    try {
      const current = parseISO(selectedDateStr);
      if (!isNaN(current.getTime())) {
        const next = addDays(current, 1);
        setSelectedDateStr(format(next, 'yyyy-MM-dd'));
      }
    } catch (e) {
      console.error(e);
    }
  };
  const [ptHours, setPtHours] = useState<number | ''>('');
  const [ptRate, setPtRate] = useState<number>(() => {
    const saved = localStorage.getItem('pt_default_rate');
    return saved ? Number(saved) : 10;
  });
  const [ptServiceDesc, setPtServiceDesc] = useState('');
  const [ptServiceValue, setPtServiceValue] = useState<number | ''>('');
  const [ptNotes, setPtNotes] = useState('');
  const [ptApplyIva, setPtApplyIva] = useState<boolean>(false);
  const [ptIvaRate, setPtIvaRate] = useState<number>(23);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Default configuration (saved in localStorage for speed & convenience)
  const [defaultRateInput, setDefaultRateInput] = useState<number>(ptRate);
  const [showConfig, setShowConfig] = useState(false);

  const monthKey = format(currentDate, 'yyyy-MM');

  // Load existing data for selected date on change
  React.useEffect(() => {
    const rec = records[selectedDateStr];
    if (rec) {
      setPtHours(rec.partTimeHours !== undefined ? rec.partTimeHours : '');
      if (rec.partTimeRate !== undefined) {
        setPtRate(rec.partTimeRate);
      }
      setPtServiceDesc(rec.partTimeServiceDesc || '');
      setPtServiceValue(rec.partTimeServiceValue !== undefined ? rec.partTimeServiceValue : '');
      setPtNotes(rec.partTimeNotes || '');
      setPtApplyIva(rec.partTimeApplyIva || false);
      setPtIvaRate(rec.partTimeIvaRate !== undefined ? rec.partTimeIvaRate : 23);
    } else {
      setPtHours('');
      setPtServiceDesc('');
      setPtServiceValue('');
      setPtNotes('');
      setPtApplyIva(false);
      setPtIvaRate(23);
    }
  }, [selectedDateStr, records]);

  // Handle Default settings change
  const saveDefaultConfig = () => {
    localStorage.setItem('pt_default_rate', defaultRateInput.toString());
    setPtRate(defaultRateInput);
    setShowConfig(false);
  };

  // Filter existing records with part-time work for the selected month
  const partTimeRecords = useMemo(() => {
    return Object.entries(records)
      .filter(([date, rec]) => {
        const isThisMonth = date.startsWith(monthKey);
        const hasPartTime = (rec.partTimeHours && rec.partTimeHours > 0) || 
                            (rec.partTimeServiceValue && rec.partTimeServiceValue > 0) ||
                            rec.partTimeServiceDesc ||
                            rec.partTimeNotes;
        return isThisMonth && hasPartTime;
      })
      .map(([date, rec]) => {
        const hours = rec.partTimeHours || 0;
        const rate = rec.partTimeRate || ptRate;
        const serviceValue = rec.partTimeServiceValue || 0;
        const gross = hours * rate + serviceValue;
        const applyIva = rec.partTimeApplyIva || false;
        const ivaRate = rec.partTimeIvaRate !== undefined ? rec.partTimeIvaRate : 23;
        const ivaValue = applyIva ? gross * (ivaRate / 100) : 0;
        const totalEarned = gross - ivaValue;
        
        return {
          date,
          hours,
          rate,
          serviceDesc: rec.partTimeServiceDesc || '',
          serviceValue,
          notes: rec.partTimeNotes || '',
          applyIva,
          ivaRate,
          ivaValue,
          gross,
          totalEarned
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records, monthKey, ptRate]);

  // Calculations for dashboard
  const ptSummary = useMemo(() => {
    let totalHours = 0;
    let hoursEarnings = 0;
    let servicesEarnings = 0;
    let totalEarnings = 0;
    let totalIvaDeducted = 0;

    partTimeRecords.forEach(r => {
      totalHours += r.hours;
      hoursEarnings += r.hours * r.rate;
      servicesEarnings += r.serviceValue;
      totalEarnings += r.totalEarned;
      totalIvaDeducted += r.ivaValue;
    });

    return {
      totalHours,
      hoursEarnings,
      servicesEarnings,
      totalEarnings,
      totalIvaDeducted,
      countDays: partTimeRecords.length
    };
  }, [partTimeRecords]);

  // Filter records by search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return partTimeRecords;
    const query = searchQuery.toLowerCase();
    return partTimeRecords.filter(r => 
      r.date.includes(query) || 
      r.serviceDesc.toLowerCase().includes(query) || 
      r.notes.toLowerCase().includes(query)
    );
  }, [partTimeRecords, searchQuery]);

  // Total global count of days with registered part-time
  const totalPtCount = useMemo(() => {
    return Object.values(records).filter(rec => 
      (rec.partTimeHours && rec.partTimeHours > 0) || 
      (rec.partTimeServiceValue && rec.partTimeServiceValue > 0) ||
      rec.partTimeServiceDesc ||
      rec.partTimeNotes
    ).length;
  }, [records]);

  // Is selected date already a registered part-time record?
  const isSelectedDatePt = useMemo(() => {
    const rec = records[selectedDateStr];
    if (!rec) return false;
    return !!(
      (rec.partTimeHours && rec.partTimeHours > 0) || 
      (rec.partTimeServiceValue && rec.partTimeServiceValue > 0) ||
      rec.partTimeServiceDesc ||
      rec.partTimeNotes
    );
  }, [records, selectedDateStr]);

  const isPtLimitReached = useMemo(() => {
    return !isPro && totalPtCount >= 5 && !isSelectedDatePt;
  }, [isPro, totalPtCount, isSelectedDatePt]);

  // Save / Update logic
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPtLimitReached) {
      if (onOpenPremium) {
        onOpenPremium();
      } else {
        alert("Limite de 5 lançamentos de Part-time atingido na versão gratuita. Ative a sua licença PRO para continuar a registar novos dias.");
      }
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const existing = records[selectedDateStr] || {
        date: selectedDateStr,
        entry: '09:00',
        exit: '18:00',
        isAbsent: false,
        hasLunchBreak: true,
        notes: '',
        location: '',
        advance: 0,
        extraHours: { h1: 0, h2: 0, h3: 0 }
      };

      const updatedRecord: WorkRecord = {
        ...existing,
        partTimeHours: ptHours === '' ? 0 : ptHours,
        partTimeRate: ptRate,
        partTimeServiceValue: ptServiceValue === '' ? 0 : ptServiceValue,
        partTimeServiceDesc: ptServiceDesc,
        partTimeNotes: ptNotes,
        partTimeApplyIva: ptApplyIva,
        partTimeIvaRate: ptIvaRate
      };

      const success = await onAddRecord(updatedRecord);
      if (success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete / Clear Part-time logic
  const handleClearDay = async (date: string) => {
    if (!window.confirm(`Tens a certeza que desejas remover o registo de Part-time do dia ${date}?`)) return;
    
    const existing = records[date];
    if (!existing) return;

    const { partTimeHours, partTimeRate, partTimeServiceValue, partTimeServiceDesc, partTimeNotes, partTimeApplyIva, partTimeIvaRate, ...mainRecord } = existing as any;
    
    // reset part-time fields on this day object
    const updatedRecord: WorkRecord = {
      ...(mainRecord as WorkRecord),
      partTimeHours: 0,
      partTimeRate: ptRate,
      partTimeServiceValue: 0,
      partTimeServiceDesc: '',
      partTimeNotes: '',
      partTimeApplyIva: false,
      partTimeIvaRate: 23
    };

    await onAddRecord(updatedRecord);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-[fadeIn_0.4s_ease-out]">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20 text-purple-400 font-bold text-[8px] uppercase tracking-[0.2em] rounded-full">
              AtriosWork Gigs
            </span>
            <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 bg-emerald-400/5 px-2 py-0.5 rounded-md border border-emerald-500/10">
              <Sparkles className="w-3 h-3" /> NOVO RECURSO
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white italic uppercase tracking-tighter leading-none">
            Controlo de <span className="text-purple-400">Part-Time</span>
          </h1>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
            Gere as horas extras, rendimentos de freelancer e serviços no teu trabalho secundário
          </p>
        </div>

        {/* MONTH SWITCHER */}
        <div className="flex items-center gap-2 bg-slate-900 border border-white/5 p-1 rounded-2xl">
          <button 
            onClick={() => setCurrentDate(prev => subMonths(prev, 1))} 
            className="p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-4 font-black text-[10px] text-white uppercase tracking-widest min-w-[120px] text-center">
            {format(currentDate, 'MMMM yyyy', { locale: pt })}
          </span>
          <button 
            onClick={() => setCurrentDate(prev => addMonths(prev, 1))} 
            className="p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* HOURS STAT CARD */}
        <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/[0.04] p-5 rounded-[2rem] overflow-hidden group hover:border-purple-500/20 transition-all shadow-md">
          <div className="absolute top-5 right-5 w-8 h-8 rounded-full bg-purple-500/5 flex items-center justify-center text-purple-400 border border-purple-500/10">
            <Clock className="w-4 h-4" />
          </div>
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">Horas de Part-time</span>
          <p className="text-3xl font-black text-white mt-1.5">{ptSummary.totalHours.toFixed(1)}h</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
            <span className="text-[7.5px] font-bold text-slate-400 uppercase">Ganhos por Horas</span>
            <span className="text-[9.5px] font-black text-purple-400">{f(ptSummary.hoursEarnings)}</span>
          </div>
        </div>

        {/* SERVICES STAT CARD */}
        <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/[0.04] p-5 rounded-[2rem] overflow-hidden group hover:border-purple-500/20 transition-all shadow-md">
          <div className="absolute top-5 right-5 w-8 h-8 rounded-full bg-blue-500/5 flex items-center justify-center text-blue-400 border border-blue-500/10">
            <Briefcase className="w-4 h-4" />
          </div>
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">Serviços & Flat-Fees</span>
          <p className="text-3xl font-black text-white mt-1.5">{f(ptSummary.servicesEarnings)}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
            <span className="text-[7.5px] font-bold text-slate-400 uppercase">Dias com Registo</span>
            <span className="text-[9.5px] font-black text-blue-400">{ptSummary.countDays} dias</span>
          </div>
        </div>

        {/* TOTAL INCOME STAT CARD */}
        <div className="relative bg-purple-950/20 backdrop-blur-xl border border-purple-500/15 p-5 rounded-[2rem] overflow-hidden group hover:border-purple-500/35 transition-all shadow-lg">
          <div className="absolute top-5 right-5 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/25">
            <Coins className="w-4 h-4" />
          </div>
          <span className="text-[8px] font-black text-purple-400 uppercase tracking-[0.2em]">Rendimento Total Part-time</span>
          <p className="text-4xl font-black text-emerald-400 mt-1.5 leading-none">{f(ptSummary.totalEarnings)}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-purple-500/10">
            <span className="text-[7.5px] font-bold text-purple-300 uppercase">
              {ptSummary.totalIvaDeducted > 0 ? `Subtotal: ${f(ptSummary.totalEarnings + ptSummary.totalIvaDeducted)}` : 'Adiciona ao Bruto Principal'}
            </span>
            <span className="text-[9.5px] font-black text-emerald-400 flex items-center gap-1">
              {ptSummary.totalIvaDeducted > 0 ? `Retenção IVA: -${f(ptSummary.totalIvaDeducted)}` : '+100% Líquido'}
            </span>
          </div>
        </div>
      </div>

      {/* BODY CONTENT - FORM AND TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* LEFT COLUMN: LOGGER FORM (2/5 size) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900/60 border border-white/5 rounded-[2.5rem] p-6 lg:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" /> Registar Dia
              </h3>
              
              <button
                type="button"
                onClick={() => {
                  setDefaultRateInput(ptRate);
                  setShowConfig(!showConfig);
                }}
                className="text-[8px] font-black text-slate-400 hover:text-purple-400 uppercase tracking-wider bg-slate-950 px-3 py-1.5 rounded-full border border-white/5 transition"
              >
                Configuração
              </button>
            </div>

            {/* DEFAULT CONFIG MODAL/EXPANDABLE */}
            {showConfig && (
              <div className="p-4 bg-slate-950/60 border border-purple-500/20 rounded-2xl space-y-3 animate-[fadeIn_0.2s_ease-out]">
                <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest">Preço Base de Part-time</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500">€/h</span>
                    <input 
                      type="number" 
                      value={defaultRateInput} 
                      onChange={e => setDefaultRateInput(Number(e.target.value))} 
                      className="w-full bg-slate-900 border border-white/5 rounded-xl pl-9 pr-2 py-2 text-white font-black text-xs outline-none" 
                    />
                  </div>
                  <button 
                    onClick={saveDefaultConfig}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-black text-[9px] uppercase tracking-wider rounded-xl transition"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* SELECT DATE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Data do Registo de Part-time</label>
                  <div className="flex gap-1 mr-1">
                    <button
                      type="button"
                      onClick={handlePrevDay}
                      className="p-1 hover:text-purple-400 text-slate-500 hover:bg-white/5 rounded-md transition"
                      title="Dia Anterior"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextDay}
                      className="p-1 hover:text-purple-400 text-slate-500 hover:bg-white/5 rounded-md transition"
                      title="Dia Seguinte"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={handlePrevDay}
                    className="p-3.5 bg-slate-950/80 hover:bg-slate-950 border border-white/5 hover:border-purple-500/20 text-slate-400 hover:text-white rounded-2xl transition flex items-center justify-center shrink-0"
                    title="Dia Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input 
                    type="date"
                    value={selectedDateStr}
                    onChange={e => setSelectedDateStr(e.target.value)}
                    className="flex-1 bg-slate-950/80 border border-white/5 rounded-2xl px-4 py-3.5 text-white font-black outline-none focus:ring-1 focus:ring-purple-500/30 text-xs text-center"
                  />
                  <button
                    type="button"
                    onClick={handleNextDay}
                    className="p-3.5 bg-slate-950/80 hover:bg-slate-950 border border-white/5 hover:border-purple-500/20 text-slate-400 hover:text-white rounded-2xl transition flex items-center justify-center shrink-0"
                    title="Dia Seguinte"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isPtLimitReached ? (
                <div className="p-6 bg-purple-950/20 rounded-3xl border border-purple-500/20 text-center space-y-5 animate-[fadeIn_0.3s_ease-out] mt-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20 relative shadow-inner">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest block font-bold">
                      Limiar de 5 Lançamentos Atingido
                    </span>
                    <h4 className="text-sm font-black text-white uppercase italic">
                      Deseja registar mais dias?
                    </h4>
                    <p className="text-[9px] text-slate-400 leading-relaxed font-semibold">
                      Na versão gratuita, o AtriosWork permite registar até <strong>5 dias de part-time</strong> nas suas folhas.
                      Ative a sua licença <strong>PRO</strong> para lançamentos ilimitados, declarações completas, relatórios em PDF e mais!
                    </p>
                  </div>

                  <div className="space-y-2 text-left border-t border-purple-500/10 pt-4 text-slate-300 font-bold text-[9px] max-w-[240px] mx-auto">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Registos de Part-time ilimitados</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Deduções de IVA e Cálculo de Retenção</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Exportação Completa de PDF em Ledger</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenPremium}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/10 transition-all text-[9px] uppercase tracking-widest relative group overflow-hidden"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5" /> Tornar-me PRO
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                  </button>
                  
                  <p className="text-[7.5px] font-medium text-slate-500 uppercase tracking-widest">
                    Seleccione uma das suas {totalPtCount}/5 datas preenchidas para as editar ou apagar.
                  </p>
                </div>
              ) : (
                <>
                  {/* HOURS WORKED & RATE */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Horas Trabalhadas</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400/50" />
                        <input 
                          type="number" 
                          step="0.1"
                          placeholder="Ex: 2.5"
                          value={ptHours}
                          onChange={e => setPtHours(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-950/80 border border-white/5 rounded-2xl pl-9 pr-3 py-3.5 text-white font-black outline-none focus:ring-1 focus:ring-purple-500/30 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor p/ Hora (€)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500">€</span>
                        <input 
                          type="number" 
                          step="0.1"
                          value={ptRate}
                          onChange={e => setPtRate(Number(e.target.value))}
                          className="w-full bg-slate-950/80 border border-white/5 rounded-2xl pl-8 pr-3 py-3.5 text-white font-black outline-none focus:ring-1 focus:ring-purple-500/30 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SERVICES LOGS */}
                  <div className="p-4 bg-slate-950/40 rounded-2xl border border-white/5 space-y-4">
                    <p className="text-[8.5px] font-black text-blue-400 uppercase tracking-widest">Serviços Avulsos / Flat fees</p>
                    
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <span className="text-[7.5px] font-bold text-slate-500 uppercase">Descrição do Serviço</span>
                        <input 
                          type="text"
                          placeholder="Ex: Entrega Especial / Coaching"
                          value={ptServiceDesc}
                          onChange={e => setPtServiceDesc(e.target.value)}
                          className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2 text-white font-black text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[7.5px] font-bold text-slate-500 uppercase">Valor Ganho pelo Serviço</span>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500">€</span>
                          <input 
                            type="number"
                            step="0.5"
                            placeholder="Ex: 50.00"
                            value={ptServiceValue}
                            onChange={e => setPtServiceValue(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full bg-slate-900 border border-white/5 rounded-xl pl-8 pr-3 py-2 text-white font-black text-xs outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* IVA DEDUCTION */}
                  <div className="p-5 bg-slate-950/50 rounded-2xl border border-white/5 space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest block">
                        Pretende aplicar IVA a este registo?
                      </label>
                      <p className="text-[9px] text-slate-400 font-bold">
                        Se ativado, o valor do IVA correspondente será deduzido dos rendimentos brutos deste part-time.
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPtApplyIva(false)}
                        className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                          !ptApplyIva
                            ? 'bg-slate-900 border-white/10 text-white shadow-lg'
                            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        Sem IVA (Isento)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPtApplyIva(true)}
                        className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                          ptApplyIva
                            ? 'bg-purple-600/20 border-purple-500/40 text-purple-200 shadow-lg shadow-purple-500/5'
                            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        Com Taxa de IVA
                      </button>
                    </div>
                    
                    {ptApplyIva && (
                      <div className="space-y-3 pt-3 border-t border-white/5 animate-[fadeIn_0.2s_ease-out]">
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Taxa de IVA Aplicável</span>
                          <div className="flex gap-1.5">
                            {[23, 13, 6].map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => setPtIvaRate(rate)}
                                className={`px-2.5 py-1 rounded-lg text-[8px] font-black border transition-all ${
                                  ptIvaRate === rate
                                    ? 'bg-purple-600 text-white border-purple-500'
                                    : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white'
                                }`}
                              >
                                {rate}%
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500">%</span>
                          <input 
                            type="number"
                            step="1"
                            min="0"
                            max="100"
                            placeholder="Ex: 23"
                            value={ptIvaRate}
                            onChange={e => setPtIvaRate(e.target.value === '' ? '' as any : Number(e.target.value))}
                            className="w-full bg-slate-900 border border-white/5 rounded-xl pl-8 pr-3 py-2.5 text-white font-black text-xs outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NOTES */}
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações Part-time</label>
                    <div className="relative">
                      <Notebook className="absolute left-3 top-3 w-4 h-4 text-slate-500/40" />
                      <textarea 
                        rows={2}
                        placeholder="Adicione notas adicionais..."
                        value={ptNotes}
                        onChange={e => setPtNotes(e.target.value)}
                        className="w-full bg-slate-950/80 border border-white/5 rounded-2xl pl-9 pr-3 py-3 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500/30 text-xs resize-none"
                      />
                    </div>
                  </div>

                  {/* SAVE / UPDATE BUTTON */}
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className={`w-full py-4 ${saveSuccess ? 'bg-green-500' : 'bg-purple-600 hover:bg-purple-500'} text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-lg transition-all text-xs uppercase tracking-widest`}
                  >
                    {isSaving ? <span className="animate-spin text-sm">⏳</span> : saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {isSaving ? 'A Guardar...' : saveSuccess ? 'Alterações Gravadas!' : 'Guardar Par-Time'}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: LIST OF RECORDS (3/5 size) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900/60 border border-white/5 rounded-[2.5rem] p-6 lg:p-8 space-y-4 flex flex-col h-full min-h-[480px]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-white/5">
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-purple-400" /> Histórico de Registo de Gigs
              </h3>
              
              {/* SEARCH FILTER */}
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Pesquisar..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl pl-9 pr-3 py-2 text-white font-bold outline-none text-[10px]"
                />
              </div>
            </div>

            {/* LIST */}
            {filteredRecords.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nenhum registo de Part-time este mês</p>
                <p className="text-[8.5px] font-medium text-slate-600 mt-1 max-w-xs leading-relaxed">
                  Utiliza o formulário ao lado para selecionar uma data e inserir horas ou serviços adicionais.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 max-h-[450px] pr-1">
                {filteredRecords.map((r, i) => (
                  <div 
                    key={i}
                    onClick={() => setSelectedDateStr(r.date)}
                    className={`p-4 bg-slate-950/60 hover:bg-slate-950 border rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors cursor-pointer relative group ${selectedDateStr === r.date ? 'border-purple-500/40 bg-purple-500/5' : 'border-white/5'}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-white uppercase tracking-tight">
                          {format(parseISO(r.date), "dd 'de' MMMM", { locale: pt })}
                        </span>
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.1em]">
                          ({r.date})
                        </span>
                      </div>
                      
                      {/* DETAIL BADGES */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {r.hours > 0 && (
                          <span className="text-[7.5px] font-black text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/10">
                            {r.hours.toFixed(1)}h @ {r.rate}€/h
                          </span>
                        )}
                        {r.serviceValue > 0 && (
                          <span className="text-[7.5px] font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/10" title={r.serviceDesc}>
                            Serviço: {r.serviceDesc || 'Flat gig'} ({f(r.serviceValue)})
                          </span>
                        )}
                        {r.applyIva && (
                          <span className="text-[7.5px] font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/10" title={`Retenção de IVA de ${f(r.ivaValue)}`}>
                            IVA: -{r.ivaRate}% (-{f(r.ivaValue)})
                          </span>
                        )}
                        {r.notes && (
                          <span className="text-[7.5px] font-medium text-slate-400 bg-slate-900 py-0.5 px-2 rounded-full max-w-[150px] truncate" title={r.notes}>
                            📝 {r.notes}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ACTIONS AND VALUES */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest block">Rendimento do Dia</span>
                        <span className="text-[12px] font-black text-emerald-400">{f(r.totalEarned)}</span>
                      </div>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearDay(r.date);
                        }}
                        className="p-2 border border-red-500/10 bg-red-500/5 hover:bg-red-500 text-red-400 hover:text-white rounded-xl transition-all self-center opacity-70 group-hover:opacity-100"
                        title="Remover registo de part-time"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default PartTimePage;
