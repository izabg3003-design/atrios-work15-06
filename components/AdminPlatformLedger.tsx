
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Database, Users, TrendingUp, ShieldOff, Copy, DollarSign, Clock, Activity, Zap } from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { supabase, getApiUrl } from '../lib/supabase';
import { WorkRecord } from '../types';

interface Props {
  f: (val: number) => string;
  adminEmail?: string;
}

const AdminPlatformLedger: React.FC<Props> = ({ f, adminEmail }) => {
  const [loading, setLoading] = useState(true);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalHours: 0,
    totalDays: 0,
    totalGrossValue: 0,
    activeUsers: 0,
    rawRowCount: 0,
    profilesCount: 0
  });

  const addLog = (msg: string) => setDebugLog(prev => [msg, ...prev].slice(0, 5));

  const SQL_NUCLEAR_FIX = `-- EXECUTAR NO SQL DO SUPABASE
ALTER TABLE public.work_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;`;

  const syncGlobalLedger = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    
    try {
      addLog("AtriosWork Cloud Global Sync...");
      
      let rawRecords: any[] = [];
      let allProfiles: any[] = [];

      if (adminEmail) {
        try {
          const res = await fetch(getApiUrl('/api/admin/ledger-stats'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ adminEmail })
          });
          if (res.ok) {
            const result = await res.json();
            if (result.success) {
              rawRecords = result.workRecords || [];
              allProfiles = result.profiles || [];
            } else {
              throw new Error(result.error || "Erro na API de Estatísticas");
            }
          } else {
            throw new Error(`Status de erro HTTP: ${res.status}`);
          }
        } catch (apiErr: any) {
          console.warn("[Ledger Sync Fallback]: Erro na chamada da API de estatísticas:", apiErr);
          const [pRes, rRes] = await Promise.all([
            supabase.from('profiles').select('*'),
            supabase.from('work_records').select('*')
          ]);
          if (rRes.error) throw new Error(rRes.error.message);
          rawRecords = rRes.data || [];
          allProfiles = pRes.data || [];
        }
      } else {
        const [pRes, rRes] = await Promise.all([
          supabase.from('profiles').select('*'),
          supabase.from('work_records').select('*')
        ]);
        if (rRes.error) throw new Error(rRes.error.message);
        rawRecords = rRes.data || [];
        allProfiles = pRes.data || [];
      }

      const profilesMap = new Map();
      allProfiles.forEach(p => { if (p.id) profilesMap.set(p.id, p); });

      let gHours = 0;
      let gGross = 0;
      const globalUniqueDays = new Set<string>();
      const activeUsersSet = new Set<string>();

      rawRecords.forEach((row: any, index: number) => {
        try {
          const uid = row.user_id || 'unlinked';
          const profile = profilesMap.get(uid);
          
          // Excluir administradores, suporte e parceiros (vendedores) de serem contados na força de trabalho ativa
          const email = (profile?.email || row.user_email || '').toLowerCase();
          const role = profile?.role || 'user';
          const isExcluded = 
            email.includes('master@atrioswork.com') || 
            email.includes('izarellebraga@gmail.com') || 
            email.includes('master@digitalnexus.com') ||
            email.includes('jefersongoes36@gmail.com') ||
            role === 'vendor' ||
            role === 'support' ||
            role === 'admin';

          if (!isExcluded && uid !== 'unlinked') {
            activeUsersSet.add(uid);
          }
          
          let data: WorkRecord;
          if (!row.data) {
             data = { entry: row.entry || '00:00', exit: row.exit || '00:00', isAbsent: row.is_absent || false, hasLunchBreak: row.has_lunch_break ?? true, date: row.date || '2025-01-01', extraHours: { h1: 0, h2: 0, h3: 0 }, location: '', notes: '', advance: 0 };
          } else if (typeof row.data === 'string') {
            try { data = JSON.parse(row.data); } catch(e) { return; }
          } else {
            data = row.data;
          }

          const dayKey = `${uid}_${row.date || data.date || index}`;
          globalUniqueDays.add(dayKey);

          if (!data.isAbsent) {
            const [h1, m1] = (data.entry || "00:00").split(':').map(n => parseInt(n) || 0);
            const [h2, m2] = (data.exit || "00:00").split(':').map(n => parseInt(n) || 0);
            let hours = (h2 + m2 / 60) - (h1 + m1 / 60);
            if (data.hasLunchBreak) hours -= 1;

            if (hours > 0) {
              gHours += hours;
              const rate = Number(profile?.hourlyRate) || 10;
              const basePay = hours * rate;
              const eRates = profile?.overtimeRates || { h1: 50, h2: 75, h3: 100 };
              const eHours = data.extraHours || { h1: 0, h2: 0, h3: 0 };
              const bonus = (Number(eHours.h1 || 0) * rate * (Number(eRates.h1) / 100)) + 
                            (Number(eHours.h2 || 0) * rate * (Number(eRates.h2) / 100)) + 
                            (Number(eHours.h3 || 0) * rate * (Number(eRates.h3) / 100));

              gGross += (basePay + bonus);
            }
          }
        } catch (err) { }
      });

      // Contagem de trabalhadores (membros normais com papel 'user') registados
      const registeredWorkersCount = allProfiles.filter(p => {
        const role = p.role || 'user';
        const email = (p.email || '').toLowerCase();
        return role === 'user' && 
               !email.includes('master@atrioswork.com') && 
               !email.includes('izarellebraga@gmail.com') && 
               !email.includes('master@digitalnexus.com') &&
               !email.includes('jefersongoes36@gmail.com');
      }).length;

      // Unir trabalhadores registados com utilizadores com registos de atividade ativos
      const finalWorkforceCount = Math.max(registeredWorkersCount, activeUsersSet.size);

      setStats({
        totalHours: gHours,
        totalDays: globalUniqueDays.size,
        totalGrossValue: gGross,
        activeUsers: finalWorkforceCount,
        rawRowCount: rawRecords.length,
        profilesCount: allProfiles.length
      });
      addLog(`Métricas globais atualizadas: ${rawRecords.length} registos.`);

    } catch (error: any) {
      addLog("Erro na rede AtriosWork.");
    } finally {
      setLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => {
    syncGlobalLedger();
    
    if (!supabase || typeof supabase.channel !== 'function') {
      const poller = setInterval(() => {
        syncGlobalLedger(true);
      }, 4000);
      return () => clearInterval(poller);
    }

    try {
      const channel1 = supabase.channel('atrioswork_ops_live');
      if (channel1 && typeof channel1.on === 'function') {
        channel1
          .on('postgres_changes', { event: '*', schema: 'public', table: 'work_records' }, () => syncGlobalLedger(true))
          .subscribe();
      }

      const channel2 = supabase.channel('atrioswork_profiles_live');
      if (channel2 && typeof channel2.on === 'function') {
        channel2
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => syncGlobalLedger(true))
          .subscribe();
      }

      const poller = setInterval(() => {
        syncGlobalLedger(true);
      }, 4000);

      return () => { 
        try {
          if (typeof supabase.removeChannel === 'function') {
            if (channel1) supabase.removeChannel(channel1); 
            if (channel2) supabase.removeChannel(channel2);
          }
        } catch (e) {}
        clearInterval(poller);
      };
    } catch (realtimeErr) {
      console.warn('[AdminPlatformLedger Realtime Setup Error]:', realtimeErr);
      const poller = setInterval(() => {
        syncGlobalLedger(true);
      }, 4000);
      return () => clearInterval(poller);
    }
  }, [syncGlobalLedger]);

  // Prepara os dados para os anéis de rodela
  const chartData = [
    {
      name: 'Faturação Global',
      value: stats.totalGrossValue,
      fill: '#10b981',
    },
    {
      name: 'Horas Globais',
      value: stats.totalHours,
      fill: '#6366f1',
    }
  ];

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
        <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
        <p className="text-[10px] font-black text-white uppercase tracking-[0.4em] animate-pulse">Sincronizando AtriosWork Management...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] pb-24">
      {/* SQL ALERT */}
      {stats.rawRowCount === 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-8 rounded-[3rem] space-y-6 shadow-2xl">
           <div className="flex items-start gap-4">
              <ShieldOff className="w-10 h-10 text-rose-500 shrink-0" />
              <div className="space-y-2">
                 <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">RESTRIÇÃO DE DADOS</h3>
                 <p className="text-xs text-slate-400 leading-relaxed font-medium">Não foram detectados dados operativos. Execute o fix abaixo para liberar a visualização global.</p>
              </div>
           </div>
           <div className="relative">
              <pre className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-[10px] text-emerald-400 font-mono overflow-x-auto">{SQL_NUCLEAR_FIX}</pre>
              <button onClick={() => { navigator.clipboard.writeText(SQL_NUCLEAR_FIX); alert("SQL Copiado!"); }} className="absolute top-4 right-4 p-3 bg-slate-800 text-white rounded-xl hover:bg-emerald-600 transition-all shadow-xl"><Copy className="w-4 h-4" /></button>
           </div>
        </div>
      )}

      {/* HEADER EXECUTIVO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">PLATAFORMA <span className="text-indigo-400">LEDGER</span></h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">AtriosWork • Visão Macro de Performance</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-5 py-2.5 bg-slate-900 border border-white/5 rounded-2xl flex items-center gap-4 shadow-inner">
             <div className="flex items-center gap-2"><Database className="w-4 h-4 text-indigo-400" /><span className="text-[10px] font-black text-white uppercase">{stats.rawRowCount}</span></div>
             <div className="w-[1px] h-4 bg-slate-800"></div>
             <div className="flex items-center gap-2"><Users className="w-4 h-4 text-purple-400" /><span className="text-[10px] font-black text-white uppercase">{stats.activeUsers}</span></div>
          </div>
          <button onClick={() => syncGlobalLedger()} className="p-4 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-2xl transition-all shadow-xl active:rotate-180 duration-500">
             <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TOTAIS TANGÍVEIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] relative overflow-hidden group shadow-lg">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Carga Horária Acumulada</p>
           <div className="flex items-baseline gap-2">
             <p className="text-4xl font-black text-white tracking-tighter">{Math.round(stats.totalHours).toLocaleString()}</p>
             <span className="text-xs font-black text-purple-500 uppercase">h</span>
           </div>
        </div>
        <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] relative overflow-hidden shadow-lg">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Dias de Operação</p>
           <p className="text-4xl font-black text-white tracking-tighter">{stats.totalDays}</p>
        </div>
        <div className="bg-indigo-600 p-8 rounded-[2.5rem] relative overflow-hidden shadow-2xl shadow-indigo-900/40">
           <p className="text-[10px] font-black text-indigo-100 uppercase tracking-widest mb-1">Faturação Bruta Total</p>
           <p className="text-4xl font-black text-white tracking-tighter">{f(stats.totalGrossValue)}</p>
        </div>
        <div className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] relative overflow-hidden shadow-lg">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Força de Trabalho Ativa</p>
           <p className="text-4xl font-black text-white tracking-tighter">{stats.activeUsers}</p>
        </div>
      </div>

      {/* MONITOR DE RODELA DUAL (RADIAL) */}
      <div className="bg-slate-800/20 border border-slate-800 rounded-[3rem] p-10 space-y-8 shadow-2xl relative overflow-hidden backdrop-blur-md">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
              <Activity className="w-5 h-5 text-indigo-400" /> Balanço Global de Operação
            </h3>
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Live AtriosWork Intelligence</span>
            </div>
         </div>
         
         <div className="flex flex-col items-center justify-center min-h-[500px] w-full relative">
            {stats.rawRowCount === 0 ? (
               <div className="flex flex-col items-center justify-center opacity-30 text-slate-500">
                  <Zap className="w-16 h-16 mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">Aguardando telemetria...</p>
               </div>
            ) : (
              <div className="w-full h-[500px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart 
                    cx="50%" 
                    cy="50%" 
                    innerRadius="40%" 
                    outerRadius="100%" 
                    barSize={40} 
                    data={chartData}
                    startAngle={180} 
                    endAngle={-180}
                  >
                    <RadialBar
                      background
                      dataKey="value"
                      cornerRadius={20}
                      isAnimationActive={true}
                    />
                    <Tooltip 
                      cursor={false}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '16px' }}
                      formatter={(value: any, name: any) => {
                        if (name === 'Faturação Global') return [f(value), 'Faturação'];
                        return [`${Math.round(value)}h`, 'Trabalho'];
                      }}
                    />
                    <Legend 
                      iconSize={10} 
                      layout="vertical" 
                      verticalAlign="middle" 
                      align="right"
                      wrapperStyle={{
                        right: 0,
                        fontSize: '10px',
                        fontWeight: '900',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                      }}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>

                {/* Centro da Rodela Executiva */}
                <div className="absolute inset-0 m-auto w-fit h-fit text-center pointer-events-none flex flex-col items-center justify-center">
                   <div className="bg-slate-950/80 p-8 rounded-full border border-white/5 backdrop-blur-lg shadow-2xl scale-110">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2 leading-none">Total Global</p>
                      <p className="text-3xl font-black text-white tracking-tighter leading-none mb-2">{f(stats.totalGrossValue)}</p>
                      <div className="w-12 h-[1px] bg-slate-800 mx-auto my-2"></div>
                      <p className="text-sm font-black text-indigo-400 tracking-widest">{Math.round(stats.totalHours)}h <span className="text-[7px] text-slate-600">PROCESSADAS</span></p>
                   </div>
                </div>
              </div>
            )}
         </div>
         
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800/50">
            <div className="flex items-center gap-4 p-5 bg-slate-950/40 rounded-3xl border border-white/5">
               <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
               </div>
               <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Faturação Bruta</p>
                  <p className="text-lg font-black text-white tracking-tighter">{f(stats.totalGrossValue)}</p>
               </div>
            </div>
            <div className="flex items-center gap-4 p-5 bg-slate-950/40 rounded-3xl border border-white/5">
               <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-indigo-500" />
               </div>
               <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Tempo Operacional</p>
                  <p className="text-lg font-black text-white tracking-tighter">{Math.round(stats.totalHours)} Horas</p>
               </div>
            </div>
         </div>
         
         <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest text-center opacity-40">Métricas consolidadas de faturamento e produtividade na AtriosWork.</p>
      </div>

      {/* ATRIOSWORK LOGS */}
      <div className="p-6 bg-black/40 border border-slate-800 rounded-3xl space-y-3">
         <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">AtriosWork Operation History</p>
         <div className="space-y-1">
            {debugLog.map((log, i) => (
              <p key={i} className="text-[9px] font-mono text-slate-500 flex items-center gap-2">
                <span className="text-indigo-500 font-black">[{i}]</span> {log}
              </p>
            ))}
         </div>
      </div>
    </div>
  );
};

export default AdminPlatformLedger;
