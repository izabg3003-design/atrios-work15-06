
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User, LifeBuoy, Loader2, Sparkles, MessageSquare, Headphones, ArrowLeft, History, Wifi, AlertTriangle, CheckCircle2, Clock, Info, Moon, Sun } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { 
  saveFallbackTicket, 
  saveFallbackMessage, 
  getFallbackMessages, 
  listenToFallbackMessages,
  getFallbackTickets,
  listenToFallbackTickets
} from '../lib/firestore-fallback';

interface Message {
  id: string;
  role: 'user' | 'ai' | 'support';
  text: string;
  timestamp: Date;
}

interface Ticket {
  id: string;
  status: string;
  subject: string;
  last_message: string;
  updated_at: string;
}

interface Props {
  user: UserProfile;
  t: (key: string) => any;
}

const UserSupportPage: React.FC<Props> = ({ user, t }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isHumanSupportActive, setIsHumanSupportActive] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [resolvedTickets, setResolvedTickets] = useState<Ticket[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'online' | 'offline' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isAgentsOnline, setIsAgentsOnline] = useState<boolean | null>(null);
  
  const hasInitialized = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const isApiFallbackSupported = useRef(typeof window !== 'undefined' && window.location.hostname !== 'atrioswork.pt' && window.location.hostname !== 'www.atrioswork.pt');

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior });
    }, 100);
  }, []);

  const checkAgentsAvailability = useCallback(async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .or(`role.in.("support","admin"),email.ilike.master@atrioswork.com,email.ilike.izarelleBraga@gmail.com,email.ilike.master@digitalnexus.com`)
        .gt('updated_at', fiveMinutesAgo);
      
      const online = (count || 0) > 0;
      setIsAgentsOnline(online);
      return online;
    } catch (e) {
      setIsAgentsOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    checkAgentsAvailability();
    const interval = setInterval(checkAgentsAvailability, 30000);
    return () => clearInterval(interval);
  }, [checkAgentsAvailability]);

  useEffect(() => {
    if (!user.id) return;

    setIsLoadingHistory(true);

    const loadInitialState = async () => {
      try {
        const fsTickets = await getFallbackTickets();
        
        // Determinar se o ticket do utilizador está ativo/aberto
        const myTicket = fsTickets.find((t: any) => t.user_id === user.id);
        const isTicketOpen = myTicket && myTicket.status === 'open';
        setIsHumanSupportActive(!!isTicketOpen);
        setConnectionStatus(isTicketOpen ? (isAgentsOnline ? 'online' : 'offline') : 'idle');

        // Preencher o histórico de tickets resolvidos do utilizador
        const myResolved = fsTickets.filter((t: any) => t.user_id === user.id && t.status === 'resolved');
        setResolvedTickets(myResolved.map((t: any) => ({
          id: t.id,
          status: t.status,
          subject: 'Atendimento de Suporte',
          last_message: t.last_message,
          updated_at: t.updated_at
        })));

        // Carregar mensagens iniciais
        const fsMessages = await getFallbackMessages(user.id);
        if (fsMessages.length > 0) {
          setMessages(fsMessages.map((m: any) => ({
            id: m.id,
            role: m.sender_role,
            text: m.text,
            timestamp: new Date(m.created_at)
          })));
        } else {
          setMessages([{ 
            id: 'welcome', 
            role: 'ai', 
            text: "Olá! Sou a assistente da AtriosWork. Como posso ajudar com o seu controlo de horas no AtriosWork?", 
            timestamp: new Date() 
          }]);
        }
      } catch (err) {
        console.warn("Erro ao carregar estado inicial do Firestore:", err);
        setErrorMessage("Erro ao carregar histórico de suporte.");
      } finally {
        setIsLoadingHistory(false);
        scrollToBottom("auto");
      }
    };

    loadInitialState();

    // Ouvinte em tempo real para as mensagens do chat no Firestore
    const unsubscribeMessages = listenToFallbackMessages(user.id, (fsMessages) => {
      if (fsMessages.length > 0) {
        setMessages(fsMessages.map((m: any) => ({
          id: m.id,
          role: m.sender_role,
          text: m.text,
          timestamp: new Date(m.created_at)
        })));
      }
      scrollToBottom();
    });

    // Ouvinte em tempo real para o status do ticket do utilizador no Firestore
    const unsubscribeTickets = listenToFallbackTickets((fsTickets) => {
      const myTicket = fsTickets.find((t: any) => t.user_id === user.id);
      const isTicketOpen = myTicket && myTicket.status === 'open';
      setIsHumanSupportActive(!!isTicketOpen);
      setConnectionStatus(isTicketOpen ? (isAgentsOnline ? 'online' : 'offline') : 'idle');

      const myResolved = fsTickets.filter((t: any) => t.user_id === user.id && t.status === 'resolved');
      setResolvedTickets(myResolved.map((t: any) => ({
        id: t.id,
        status: t.status,
        subject: 'Atendimento de Suporte',
        last_message: t.last_message,
        updated_at: t.updated_at
      })));
    });

    return () => {
      unsubscribeMessages();
      unsubscribeTickets();
    };
  }, [user.id, isAgentsOnline, scrollToBottom]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || sendingRef.current) return;

    const currentText = inputText.trim();
    setInputText('');
    setIsSending(true);
    sendingRef.current = true;

    // Adicionar mensagem do utilizador localmente para feedback imediato
    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      text: currentText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, tempUserMsg]);
    scrollToBottom();

    if (isHumanSupportActive) {
      // Gravar mensagem no Firestore Fallback (Servidor independente / Nuvem resiliente)
      try {
        await saveFallbackMessage(user.id, currentText, 'user');
      } catch (fsErr) {
        console.warn("Erro ao salvar mensagem no Firestore Fallback:", fsErr);
      }

      // Sincronizar ticket no Firestore Fallback
      try {
        await saveFallbackTicket(user.id, 'open', currentText, user.name || 'Utilizador', user.email || '');
      } catch (fsErr) {
        console.warn("Erro ao sincronizar ticket no Firestore Fallback:", fsErr);
      }

      // Disparar notificação push real FCM para admins via Supabase Edge Function (se suportado)
      try {
        await supabase.functions.invoke('send-fcm-push', {
          body: {
            title: '💬 Nova Mensagem de Suporte',
            body: `${user.name || 'Utilizador'}: "${currentText.substring(0, 60)}${currentText.length > 60 ? '...' : ''}"`,
            audience: 'admin'
          }
        });
      } catch (fcmErr) {
        console.warn('Erro ao disparar push de mensagem de suporte:', fcmErr);
      }

      setIsSending(false);
      sendingRef.current = false;
    } else {
      setIsTyping(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Filtrar histórico para a IA garantindo que comece com 'user'
        const rawHistory = messages
          .filter(m => m.role === 'user' || m.role === 'ai')
          .map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
          }));
        
        const firstUserIdx = rawHistory.findIndex(h => h.role === 'user');
        const chatHistory = firstUserIdx !== -1 ? rawHistory.slice(firstUserIdx) : [];

        const systemInstruction = `
          Tu és a assistente virtual da AtriosWork, especialista no AtriosWork.
          Sê profissional, direta e prestativa.
          Informações do AtriosWork:
          - Função: Controlo de horas profissional (Entrada, Saída, Pausa Almoço, Horas Extras H1/H2/H3).
          - Gestão Financeira: Cálculo automático de IRS, Segurança Social e IVA (para freelancers).
          - Relatórios: Geração de relatórios mensais e anuais em PDF (Ledger) para contabilistas.
          - Parceiros: Sistema de rede de vendedores parceiros com códigos de desconto e comissões.
          - Segurança: Dados encriptados na AtriosWork Cloud.
          Se o utilizador perguntar sobre a empresa, explica que a AtriosWork é uma infraestrutura de inteligência financeira e soberania temporal.
          Se não souberes algo, sugere falar com um atendente humano usando o botão de suporte.
        `;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [...chatHistory, { role: 'user', parts: [{ text: currentText }] }],
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.7,
            topP: 0.95
          }
        });

        const aiText = response.text || "Desculpe, tive um problema ao processar a sua pergunta. Pode tentar novamente ou chamar um humano?";
        
        // Guardar no Firestore Fallback
        try {
          await saveFallbackMessage(user.id, currentText, 'user');
          await saveFallbackMessage(user.id, aiText, 'ai');
        } catch (fsErr) {
          console.warn("Erro ao salvar mensagens AI no Firestore Fallback:", fsErr);
        }

      } catch (err: any) {
        console.error("AI Error:", err);
        setMessages(prev => [...prev, { 
          id: 'err-' + Date.now(), 
          role: 'ai', 
          text: "Ocorreu um erro na minha rede neural. Por favor, tente novamente em instantes ou solicite atendimento humano.", 
          timestamp: new Date() 
        }]);
      } finally {
        setIsTyping(false);
        setIsSending(false);
        sendingRef.current = false;
        scrollToBottom();
      }
    }
  };

  const startHumanSupport = async () => {
    if (sendingRef.current) return;
    setConnectionStatus('connecting');
    sendingRef.current = true;
    const triggerText = "O utilizador solicitou falar com um atendente humano agora.";
    
    let isOnline = false;
    try {
      isOnline = await checkAgentsAvailability();
    } catch (err) {
      console.warn("Erro ao checar agentes:", err);
    }

    // Gravar no Firestore Fallback
    try {
      await saveFallbackMessage(user.id, "--- SOLICITAÇÃO DE ATENDIMENTO HUMANO ---", 'user');
    } catch (fsErr) {
      console.warn("Erro ao salvar mensagem no Firestore Fallback:", fsErr);
    }

    // Sincronizar ticket no Firestore Fallback
    try {
      await saveFallbackTicket(user.id, 'open', triggerText, user.name || 'Utilizador', user.email || '');
    } catch (fsErr) {
      console.warn("Erro ao salvar ticket no Firestore Fallback:", fsErr);
    }
    
    // Disparar notificação push real FCM para admins via Edge Function
    try {
      await supabase.functions.invoke('send-fcm-push', {
        body: {
          title: '🆘 Atendimento Humano Solicitado!',
          body: `O utilizador ${user.name} (${user.email}) solicitou atendimento humano no chat.`,
          audience: 'admin'
        }
      });
    } catch (fcmErr) {
      console.warn('Erro ao disparar push de atendimento humano:', fcmErr);
    }

    setIsHumanSupportActive(true);
    setConnectionStatus(isOnline ? 'online' : 'offline');
    
    const sysMsg: Message = { 
      id: 'sys-' + Date.now(), 
      role: 'support', 
      text: isOnline ? "Conectando-o a um agente da AtriosWork. Por favor, aguarde um momento." : "De momento todos os nossos agentes estão ocupados. Deixe a sua mensagem e responderemos assim que possível.", 
      timestamp: new Date() 
    };
    
    setMessages(prev => [...prev, sysMsg]);
    scrollToBottom();
    sendingRef.current = false;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex justify-between items-center bg-slate-900/40 p-6 rounded-[2.5rem] border border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-blue-600/20 rounded-2xl border border-blue-500/20">
            <LifeBuoy className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">AtriosWork <span className="text-blue-400">Support</span></h2>
            <div className="flex items-center gap-2 mt-1">
              {isHumanSupportActive ? (
                <>
                  <div className={`w-2 h-2 rounded-full ${connectionStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-orange-500'}`}></div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{connectionStatus === 'online' ? "Agente Online" : "Agente Indisponível"}</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Assistente AtriosWork AI Ativa</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex p-1 bg-slate-950/50 rounded-2xl border border-white/5">
           <button onClick={() => setView('chat')} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === 'chat' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>Chat Ativo</button>
           <button onClick={() => setView('history')} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === 'history' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>Histórico</button>
        </div>
      </div>

      {view === 'chat' ? (
        <div className="bg-slate-800/20 border border-slate-800 rounded-[3rem] p-4 md:p-8 flex flex-col h-[650px] shadow-2xl overflow-hidden backdrop-blur-sm">
           <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {isLoadingHistory ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest">A carregar...</p>
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div key={m.id || idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-[slideUp_0.3s_ease-out]`}>
                    <div className="flex items-start gap-3 max-w-[85%]">
                      {m.role !== 'user' && (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 ${m.role === 'support' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'}`}>
                          {m.role === 'support' ? <Headphones className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>
                      )}
                      <div className={`p-4 rounded-2xl shadow-lg ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-900/80 text-slate-200 border border-white/5 rounded-tl-none'}`}>
                        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{m.text}</p>
                        <p className={`text-[8px] font-black uppercase opacity-40 mt-2 text-right`}>
                          {format(m.timestamp, 'HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {isTyping && (
                <div className="flex justify-start animate-pulse">
                  <div className="bg-slate-900/80 p-4 rounded-2xl border border-white/5 flex gap-2">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
           </div>

           <div className="mt-4 p-4 space-y-4">
              {!isHumanSupportActive && !isLoadingHistory && (
                <button onClick={startHumanSupport} className="w-full py-3 bg-slate-900/60 border border-blue-500/20 rounded-2xl text-[9px] font-black text-blue-400 uppercase tracking-widest hover:bg-blue-600/10 transition-all flex items-center justify-center gap-2">
                  <Headphones className="w-3.5 h-3.5" /> Falar com Atendente Humano
                </button>
              )}
              
              <form onSubmit={handleSend} className="flex gap-3 bg-slate-900/80 p-3 rounded-[2rem] border border-white/10 shadow-xl">
                 <input 
                   type="text" 
                   value={inputText} 
                   onChange={e => setInputText(e.target.value)} 
                   placeholder="Escreva a sua mensagem..." 
                   disabled={isSending}
                   className="flex-1 bg-transparent px-4 py-2 text-white text-sm outline-none placeholder:text-slate-600 font-medium disabled:opacity-50"
                 />
                 <button type="submit" disabled={!inputText.trim() || isSending} className="w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 disabled:opacity-20 group">
                   {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />}
                 </button>
              </form>
           </div>
        </div>
      ) : (
        <div className="bg-slate-800/20 border border-slate-800 rounded-[3rem] p-8 space-y-6 min-h-[500px]">
           <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
             <History className="w-5 h-5 text-blue-400" /> Histórico de Tickets
           </h3>
           <div className="grid grid-cols-1 gap-4">
              {resolvedTickets.length === 0 ? (
                <div className="py-20 text-center opacity-30">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Sem registos no histórico.</p>
                </div>
              ) : resolvedTickets.map(ticket => (
                <div key={ticket.id} className="p-6 bg-slate-900/40 border border-white/5 rounded-2xl flex justify-between items-center group hover:border-blue-500/30 transition-all">
                   <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{format(new Date(ticket.updated_at), 'dd MMM yyyy')}</p>
                      <h4 className="text-white font-bold italic truncate max-w-md">"{ticket.last_message}"</h4>
                   </div>
                   <div className="px-4 py-1 bg-green-500/10 border border-green-500/20 rounded-full"><span className="text-[8px] font-black text-green-400 uppercase">Resolvido</span></div>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
};

export default UserSupportPage;
