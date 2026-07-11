
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Loader2, User, LayoutDashboard, DollarSign, FileText, LifeBuoy, X, 
  ArrowLeft, Info, ExternalLink, ShieldCheck, Mail, Phone, Calendar, 
  MessageSquare, Clock, Send, Headphones, CheckCircle, Bell, BellRing, 
  Volume2, VolumeX, MonitorSmartphone 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile, WorkRecord } from '../types';
import { 
  saveFallbackTicket, 
  saveFallbackMessage, 
  resolveFallbackTicket, 
  getFallbackTickets, 
  getFallbackMessages, 
  listenToFallbackTickets, 
  listenToFallbackMessages 
} from '../lib/firestore-fallback';

interface Props {
  user: UserProfile;
  f: (val: number) => string;
  t: (key: string) => any;
}

const SupportPage: React.FC<Props> = ({ user, f, t }) => {
  const [activeTab, setActiveTab] = useState<'search' | 'active_chats' | 'resolved'>('active_chats');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [activeView, setActiveView] = useState<'info' | 'dashboard' | 'chat'>('chat');
  
  const [activeChats, setActiveChats] = useState<any[]>([]);
  const [resolvedTickets, setResolvedTickets] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newTicketPulse, setNewTicketPulse] = useState(false);
  const [dbWarning, setDbWarning] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const replyingRef = useRef(false);
  const lastTicketUpdatedAt = useRef<string | null>(null);
  const isApiFallbackSupported = useRef(typeof window !== 'undefined' && window.location.hostname !== 'atrioswork.pt' && window.location.hostname !== 'www.atrioswork.pt');
  
  // Referência para o objeto de áudio persistente
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [chatMessages]);

  // Inicializa o alarme sonoro (Sinal de Alerta Industrial/Digital de Alta Intensidade)
  useEffect(() => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3');
    audio.loop = true;
    audio.volume = 1.0; // Volume Máximo
    alarmAudioRef.current = audio;

    return () => {
      audio.pause();
      alarmAudioRef.current = null;
    };
  }, []);

  const startAlarm = () => {
    if (soundEnabled && alarmAudioRef.current) {
      alarmAudioRef.current.play().catch(e => console.warn("Autoplay bloqueado pelo browser. Requer interação prévia.", e));
    }
  };

  const stopAlarm = () => {
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.currentTime = 0;
    }
    setNewTicketPulse(false);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  const backToList = () => {
    setSelectedUser(null);
    setActiveView('chat');
    stopAlarm();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .limit(20);
      
      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async (isNewTrigger = false) => {
    let active: any[] = [];
    let resolved: any[] = [];

    // Tentar ler do Firestore Fallback (Autoritativo) para máxima confiabilidade
    try {
      const fsTickets = await getFallbackTickets();
      fsTickets.forEach((ft: any) => {
        const ticketData = {
          id: ft.id,
          user_id: ft.user_id,
          status: ft.status,
          last_message: ft.last_message,
          updated_at: ft.updated_at,
          profiles: {
            id: ft.user_id,
            name: ft.user_name || 'Visitante/Utilizador',
            email: ft.user_email || '',
            role: 'user'
          }
        };
        if (ft.status === 'open') {
          active.push(ticketData);
        } else if (ft.status === 'resolved') {
          resolved.push(ticketData);
        }
      });
    } catch (fsErr) {
      console.warn("Erro ao buscar tickets do Firestore Fallback:", fsErr);
    }

    // Ordenar por updated_at descendente
    active.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    resolved.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (active.length > 0) {
      const newest = active[0];
      if (isNewTrigger) {
        if (newest.updated_at !== lastTicketUpdatedAt.current && newest.user_id !== selectedUser?.id) {
          lastTicketUpdatedAt.current = newest.updated_at;
          handleNewTicketAlert(newest);
        }
      } else {
        lastTicketUpdatedAt.current = newest.updated_at;
      }
    }
    
    setActiveChats(active);
    setResolvedTickets(resolved);
  };

  const handleNewTicketAlert = (ticket: any) => {
    setNewTicketPulse(true);
    startAlarm();
    
    if (notificationsEnabled) {
      const n = new Notification("AtriosWork - ALERTA URGENTE", {
        body: `NOVO TICKET DE: ${ticket.profiles?.name || 'Visitante'}\n"${ticket.last_message}"`,
        icon: "/logo_atualizado.jpg?v=20260314_v1",
        requireInteraction: true,
        tag: "atrioswork-alert"
      });
      n.onclick = () => {
        window.focus();
        stopAlarm();
      };
    }
  };

  useEffect(() => {
    fetchTickets();
    requestNotificationPermission();

    // Ouvinte em tempo real do Firestore Fallback para novos tickets/alterações
    let unsubscribeFirestore: any = null;
    try {
      unsubscribeFirestore = listenToFallbackTickets((fsTickets) => {
        fetchTickets(true);
      });
    } catch (fsErr) {
      console.warn("Erro ao assinar tickets do Firestore Fallback:", fsErr);
    }

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [selectedUser]);

  useEffect(() => {
    if (activeView !== 'chat' || !selectedUser?.id) return;
    const fetchMsgs = async () => {
       let combinedMsgs: any[] = [];

       // Integrar histórico do Firestore Fallback para redundância total
       try {
         const fsMessages = await getFallbackMessages(selectedUser.id);
         fsMessages.forEach((fm: any) => {
           combinedMsgs.push({
             id: fm.id,
             user_id: fm.user_id,
             text: fm.text,
             sender_role: fm.sender_role,
             created_at: fm.created_at
           });
         });
       } catch (fsErr) {
         console.warn("Erro ao carregar histórico do Firestore Fallback:", fsErr);
       }

       combinedMsgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
       setChatMessages(combinedMsgs);
    };
    fetchMsgs();

    // Ouvinte em tempo real do Firestore Fallback para respostas instantâneas
    let unsubscribeFirestoreMsgs: any = null;
    try {
      unsubscribeFirestoreMsgs = listenToFallbackMessages(selectedUser.id, (fsMessages) => {
        setChatMessages(prev => {
          const updated = [...prev];
          fsMessages.forEach(fm => {
            const exists = updated.some(m => m.id === fm.id || (m.text === fm.text && Math.abs(new Date(m.created_at).getTime() - new Date(fm.created_at).getTime()) < 5000));
            if (!exists) {
              if (fm.sender_role === 'user') startAlarm();
              updated.push({
                id: fm.id,
                user_id: fm.user_id,
                text: fm.text,
                sender_role: fm.sender_role,
                created_at: fm.created_at
              });
            }
          });
          updated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return updated;
        });
      });
    } catch (fsErr) {
      console.warn("Erro ao subscrever chat do Firestore Fallback:", fsErr);
    }

    return () => {
      if (unsubscribeFirestoreMsgs) unsubscribeFirestoreMsgs();
    };
  }, [activeView, selectedUser?.id]);

  const getProfileFromTicket = (ticket: any): UserProfile | null => {
    if (!ticket.profiles) return null;
    return Array.isArray(ticket.profiles) ? ticket.profiles[0] : ticket.profiles;
  };

  const selectUser = async (target: UserProfile) => {
    if (!target?.id) return;
    setLoading(true);
    setSelectedUser(target);
    setActiveView('chat');
    setLoading(false);
    stopAlarm(); // Para o alarme ao começar o atendimento
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedUser?.id || replyingRef.current) return;
    
    const currentReply = replyText.trim();
    setReplyText('');
    replyingRef.current = true;

    // Adiciona a mensagem de forma otimista localmente
    const tempId = 'temp-' + Date.now();
    setChatMessages(prev => [...prev, {
      id: tempId,
      user_id: selectedUser.id,
      text: currentReply,
      sender_role: 'support',
      created_at: new Date().toISOString()
    }]);
    
    // Gravar no Firestore Fallback
    try {
      await saveFallbackMessage(selectedUser.id, currentReply, 'support');
    } catch (fsErr) {
      console.warn("Erro ao salvar mensagem no Firestore Fallback:", fsErr);
    }

    // Atualizar no Firestore Fallback
    try {
      await saveFallbackTicket(selectedUser.id, 'open', currentReply, selectedUser.name || 'Utilizador', selectedUser.email || '');
    } catch (fsErr) {
      console.warn("Erro ao salvar ticket no Firestore Fallback:", fsErr);
    }

    // Disparar push fcm/vapid direcionado e exclusivo para o utilizador (Sempre executado!)
    try {
      await supabase.functions.invoke('send-fcm-push', {
        body: {
          title: '💬 Suporte AtriosWork',
          body: `Nova mensagem do suporte: "${currentReply.substring(0, 60)}${currentReply.length > 60 ? '...' : ''}"`,
          audience: 'user',
          targetUserId: selectedUser.id,
          targetUserEmail: selectedUser.email,
          url: '/'
        }
      });
    } catch (fcmErr) {
      console.warn('Erro ao disparar push de resposta de suporte:', fcmErr);
    }

    replyingRef.current = false;
  };

  const resolveTicket = async (userId: string) => {
    if (!userId || loading) return;
    setLoading(true);
    setDbWarning(null); // Limpar aviso anterior
    try {
      // Resolver no Firestore Fallback
      try {
        await resolveFallbackTicket(userId);
      } catch (fsErr) {
        console.warn("Erro ao resolver ticket no Firestore Fallback:", fsErr);
      }

      setSelectedUser(null);
      await fetchTickets();
    } catch (err: any) {
      console.error("AtriosWork Resolve Error:", err);
      setSelectedUser(null);
      await fetchTickets();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] pb-24">
      {/* Alerta Visual de Novo Ticket com botão para silenciar */}
      {newTicketPulse && (
        <div className="fixed top-6 right-6 z-[3000] animate-bounce">
           <div className="bg-red-600 text-white px-6 py-4 rounded-2xl shadow-[0_20px_50px_rgba(220,38,38,0.5)] border-2 border-white flex flex-col items-center gap-2">
              <div className="flex items-center gap-4">
                <BellRing className="w-8 h-8 animate-ping" />
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest">ALERTA CRÍTICO</p>
                   <p className="text-sm font-bold italic">NOVO TICKET NA FILA!</p>
                </div>
              </div>
              <button 
                onClick={stopAlarm}
                className="mt-2 w-full py-2 bg-white text-red-600 rounded-xl font-black text-[10px] uppercase hover:bg-slate-100 transition-all"
              >
                Silenciar Alarme
              </button>
           </div>
        </div>
      )}

      {/* Aviso de Trigger Corrompido no Supabase */}
      {dbWarning && (
        <div className="bg-amber-950/40 border-2 border-amber-500/50 p-6 rounded-[2.5rem] text-slate-100 flex flex-col md:flex-row items-start justify-between gap-6 shadow-2xl animate-[fadeIn_0.3s_ease-out]">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 text-amber-400">
              <Info className="w-5 h-5 animate-pulse" />
              <p className="text-xs font-black uppercase tracking-widest">Aviso de Banco de Dados (Supabase)</p>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              O ticket foi marcado como resolvido <strong>no seu ecrã</strong> para não interromper o seu trabalho, mas o banco de dados do seu Supabase rejeitou a gravação porque existe um <strong>Trigger corrompido</strong> (devido à falta da extensão <code className="bg-black/50 px-1 py-0.5 rounded text-amber-300 font-mono">pg_net</code> ou à função <code className="bg-black/50 px-1 py-0.5 rounded text-amber-300 font-mono">net.http_post</code> ausente).
            </p>
            <p className="text-[11px] text-slate-400">
              Para corrigir isso permanentemente, aceda ao <strong>SQL Editor</strong> no painel do seu Supabase e execute:
            </p>
            <pre className="bg-black/80 p-3 rounded-xl text-[10px] font-mono text-amber-300 overflow-x-auto border border-amber-500/20 select-all">
{`-- 1. Remover TODAS as possíveis triggers da tabela support_tickets
DROP TRIGGER IF EXISTS send_push_trigger ON support_tickets;
DROP TRIGGER IF EXISTS send_push_on_ticket_update ON support_tickets;
DROP TRIGGER IF EXISTS on_ticket_created ON support_tickets;
DROP TRIGGER IF EXISTS on_ticket_updated ON support_tickets;
DROP TRIGGER IF EXISTS on_ticket_change ON support_tickets;
DROP TRIGGER IF EXISTS ticket_trigger ON support_tickets;
DROP TRIGGER IF EXISTS support_ticket_trigger ON support_tickets;

-- 2. Remover TODAS as possíveis triggers da tabela chat_messages
DROP TRIGGER IF EXISTS send_push_trigger ON chat_messages;
DROP TRIGGER IF EXISTS send_push_on_message ON chat_messages;
DROP TRIGGER IF EXISTS on_message_created ON chat_messages;
DROP TRIGGER IF EXISTS on_message_updated ON chat_messages;
DROP TRIGGER IF EXISTS on_message_change ON chat_messages;
DROP TRIGGER IF EXISTS message_trigger ON chat_messages;
DROP TRIGGER IF EXISTS chat_message_trigger ON chat_messages;

-- 3. Remover TODAS as possíveis triggers da tabela app_banners
DROP TRIGGER IF EXISTS send_push_trigger ON app_banners;
DROP TRIGGER IF EXISTS send_push_on_banner ON app_banners;
DROP TRIGGER IF EXISTS on_banner_created ON app_banners;
DROP TRIGGER IF EXISTS on_banner_updated ON app_banners;
DROP TRIGGER IF EXISTS on_banner_change ON app_banners;`}
            </pre>
          </div>
          <button 
            onClick={() => setDbWarning(null)} 
            className="px-4 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl font-bold text-[10px] uppercase tracking-wider text-slate-400 hover:text-white transition-all whitespace-nowrap self-stretch md:self-auto flex items-center justify-center"
          >
            Fechar Aviso
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-400">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Staff Atendimento Hub</span>
          </div>
          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">PAINEL DE <span className="text-blue-400">SUPORTE</span></h2>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-slate-800/40 p-1 rounded-2xl border border-white/5 flex">
             <button onClick={() => {
               if (soundEnabled) stopAlarm();
               setSoundEnabled(!soundEnabled);
             }} className={`p-2.5 rounded-xl transition-all ${soundEnabled ? 'text-blue-400 hover:bg-blue-500/10' : 'text-slate-600'}`}>
                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
             </button>
             <button onClick={requestNotificationPermission} title="Ativar Notificações Desktop" className={`p-2.5 rounded-xl transition-all ${notificationsEnabled ? 'text-emerald-400' : 'text-slate-600 hover:text-white'}`}>
                <MonitorSmartphone className="w-5 h-5" />
             </button>
          </div>
          <div className="flex p-1 bg-slate-800/40 rounded-2xl border border-white/5 overflow-x-auto no-scrollbar">
             <button onClick={() => setActiveTab('active_chats')} className={`relative px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'active_chats' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
               Fila ({activeChats.length})
               {activeChats.length > 0 && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></div>}
             </button>
             <button onClick={() => setActiveTab('resolved')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'resolved' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Resolvidos</button>
             <button onClick={() => setActiveTab('search')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'search' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Pesquisar</button>
          </div>
        </div>
      </div>

      {selectedUser ? (
        <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
           <div className="bg-slate-800/40 p-6 rounded-[2.5rem] border border-blue-500/20 flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl">
              <div className="flex items-center gap-4">
                 <button onClick={backToList} className="p-3 bg-slate-950 rounded-xl border border-slate-800 hover:text-white transition-all text-slate-500 hover:bg-slate-900"><ArrowLeft className="w-4 h-4" /></button>
                 <div>
                    <div className="flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><p className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">Em Atendimento</p></div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mt-1">{selectedUser.name}</h3>
                 </div>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => resolveTicket(selectedUser.id!)} disabled={loading} className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-green-500 transition-all shadow-lg disabled:opacity-50">
                   {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} 
                   Marcar Resolvido
                 </button>
                 <div className="bg-slate-950/50 p-1.5 rounded-2xl border border-slate-800 flex">
                    {[{ id: 'chat', label: 'Conversa', icon: MessageSquare }, { id: 'info', label: 'Ficha AtriosWork', icon: Info }].map(v => (
                        <button key={v.id} onClick={() => setActiveView(v.id as any)} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeView === v.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>
                          <v.icon className="w-3.5 h-3.5" /> {v.label}
                        </button>
                    ))}
                 </div>
              </div>
           </div>

           <div className="bg-slate-800/20 border border-slate-800 rounded-[3rem] p-4 md:p-10 min-h-[550px] shadow-2xl relative overflow-hidden">
              {activeView === 'chat' && (
                <div className="flex flex-col h-[550px] bg-slate-950/40 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-inner">
                   <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                      {chatMessages.map(m => (
                        <div key={m.id} className={`flex ${m.sender_role === 'support' ? 'justify-end' : 'justify-start'} animate-[slideUp_0.2s_ease-out]`}>
                           <div className={`p-4 rounded-2xl max-w-[75%] shadow-md ${m.sender_role === 'support' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-900 text-slate-300 rounded-tl-none border border-white/5'}`}>
                              <p className="text-sm font-medium leading-relaxed">{m.text}</p>
                              <p className={`text-[8px] font-black uppercase opacity-50 mt-2 ${m.sender_role === 'support' ? 'text-right' : 'text-left'}`}>{new Date(m.created_at).toLocaleTimeString()}</p>
                           </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                   </div>
                   <form onSubmit={handleSendReply} className="p-5 bg-slate-900 border-t border-white/5 flex gap-3 items-center">
                      <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="Responder em direto..." />
                      <button type="submit" disabled={!replyText.trim() || replyingRef.current} className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 transition-all disabled:opacity-20 shadow-xl group"><Send className="w-5 h-5" /></button>
                   </form>
                </div>
              )}
              {activeView === 'info' && (
                <div className="space-y-10 animate-[fadeIn_0.5s_ease-out]">
                   <div className="flex items-center gap-6 border-b border-white/5 pb-8">
                      <div className="w-24 h-24 bg-slate-950 border-2 border-blue-500/20 rounded-3xl flex items-center justify-center"><User className="w-12 h-12 text-blue-400" /></div>
                      <div>
                         <h4 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedUser.name}</h4>
                         <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mt-1">Status: <span className="text-white">Registo AtriosWork</span></p>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      <div className="space-y-6">
                         <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2"><Mail className="w-3 h-3" /> Contactos</h5>
                         <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-slate-600 uppercase mb-1">E-mail</p>
                            <p className="text-sm font-bold text-white">{selectedUser.email || 'Não informado'}</p>
                         </div>
                      </div>
                   </div>
                </div>
              )}
           </div>
        </div>
      ) : activeTab === 'active_chats' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-[fadeIn_0.3s_ease-out]">
           {activeChats.length === 0 ? (
             <div className="col-span-full py-32 flex flex-col items-center justify-center space-y-4 opacity-30 border-2 border-dashed border-slate-800 rounded-[3rem]">
               <MessageSquare className="w-16 h-16 text-slate-600" />
               <p className="text-[12px] font-black text-slate-600 uppercase tracking-[0.4em]">Fila Vazia</p>
             </div>
           ) : activeChats.map(ticket => {
             const tp = getProfileFromTicket(ticket);
             const name = tp?.name || "Visitante AtriosWork";
             const email = tp?.email || "Email Oculto";
             
             return (
               <button key={ticket.id} onClick={() => selectUser(tp || { id: ticket.user_id, name, email, role: 'user', hourlyRate: 0, defaultEntry: '09:00', defaultExit: '18:00', socialSecurity: {value: 0, type: 'percentage'}, irs: {value: 0, type: 'percentage'}, vat: {value: 0, type: 'percentage'}, isFreelancer: false, overtimeRates: {h1:0, h2:0, h3:0}, photo: null })} className="bg-slate-800/20 border border-slate-800 p-8 rounded-[2.5rem] hover:border-blue-500/50 hover:bg-slate-800/40 transition-all text-left group shadow-lg">
                  <div className="flex justify-between items-start mb-6">
                     <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center font-black text-blue-400 text-2xl">{name.charAt(0)}</div>
                     <div className="px-3 py-1.5 bg-blue-500/10 rounded-full border border-blue-500/20 text-[8px] font-black text-blue-400 uppercase">Pendente</div>
                  </div>
                  <h4 className="text-xl font-black text-white uppercase italic mb-2 truncate">{name}</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2">"{ticket.last_message}"</p>
               </button>
             );
           })}
        </div>
      ) : activeTab === 'resolved' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-[fadeIn_0.3s_ease-out]">
           {resolvedTickets.length === 0 ? (
             <div className="col-span-full py-32 flex flex-col items-center justify-center space-y-4 opacity-30 border-2 border-dashed border-slate-800 rounded-[3rem]">
               <CheckCircle className="w-16 h-16 text-slate-600" />
               <p className="text-[12px] font-black text-slate-600 uppercase tracking-[0.4em]">Sem Histórico</p>
             </div>
           ) : resolvedTickets.map(ticket => {
             const tp = getProfileFromTicket(ticket);
             const name = tp?.name || "Convidado";
             return (
               <div key={ticket.id} className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] text-left group shadow-lg opacity-80">
                  <div className="flex justify-between items-start mb-6">
                     <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center font-black text-slate-500 text-2xl">{name.charAt(0)}</div>
                     <div className="px-3 py-1.5 bg-green-500/10 rounded-full border border-green-500/20 text-[8px] font-black text-green-400 uppercase">Resolvido</div>
                  </div>
                  <h4 className="text-xl font-black text-white uppercase italic mb-2">{name}</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-black mb-4 flex items-center gap-2"><Clock className="w-3 h-3" /> {new Date(ticket.updated_at).toLocaleDateString()}</p>
                  <p className="text-[11px] text-slate-500 italic">"{ticket.last_message}"</p>
               </div>
             );
           })}
        </div>
      ) : (
        <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
           <form onSubmit={handleSearch} className="relative group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input type="text" placeholder="Nome ou Email..." className="w-full bg-slate-950 border border-slate-800 rounded-[2rem] pl-16 py-6 text-white outline-none focus:ring-2 focus:ring-blue-500/30 transition-all shadow-xl" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
           </form>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading && <div className="col-span-full py-10 flex justify-center"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>}
              {!loading && searchResults.map(res => (
                <button key={res.id} onClick={() => selectUser(res)} className="flex items-center justify-between p-6 bg-slate-900/40 border border-slate-800 rounded-3xl hover:bg-slate-800/60 transition-all">
                   <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center font-black text-blue-400">{res.name.charAt(0)}</div>
                      <div className="text-left">
                         <p className="text-sm font-bold text-white">{res.name}</p>
                         <p className="text-[10px] text-slate-500 mt-2 uppercase font-black">{res.email}</p>
                      </div>
                   </div>
                   <ExternalLink className="w-5 h-5 text-slate-700" />
                </button>
              ))}
           </div>
        </div>
      )}
    </div>
  );
};

export default SupportPage;
