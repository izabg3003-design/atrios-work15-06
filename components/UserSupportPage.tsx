
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User, LifeBuoy, Loader2, Sparkles, MessageSquare, Headphones, ArrowLeft, History, Wifi, AlertTriangle, CheckCircle2, Clock, Info, Moon, Sun } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

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
      
      if (error) throw error;
      const online = (count || 0) > 0;
      setIsAgentsOnline(online);
      
      if (isHumanSupportActive) {
        setConnectionStatus(online ? 'online' : 'offline');
      }
      return online;
    } catch (e) {
      setIsAgentsOnline(false);
      return false;
    }
  }, [isHumanSupportActive]);

  useEffect(() => {
    const interval = setInterval(checkAgentsAvailability, 30000);
    return () => clearInterval(interval);
  }, [checkAgentsAvailability]);

  const reloadMessages = useCallback(async () => {
    if (!user.id) return;
    try {
      let combinedDbMessages: any[] = [];
      try {
        const { data: dbMessages } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        if (dbMessages) combinedDbMessages = [...dbMessages];
      } catch (e) {
        console.warn("Erro ao ler do Supabase:", e);
      }

      try {
        const fbRes = await fetch(`/api/fallback-messages/${user.id}`);
        if (fbRes.ok) {
          const fbMessages = await fbRes.json();
          fbMessages.forEach((fm: any) => {
            if (!combinedDbMessages.some(m => m.id === fm.id || (m.text === fm.text && Math.abs(new Date(m.created_at).getTime() - new Date(fm.created_at).getTime()) < 5000))) {
              combinedDbMessages.push(fm);
            }
          });
        }
      } catch (e) {
        console.warn("Erro ao ler fallback local:", e);
      }

      combinedDbMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (combinedDbMessages.length > 0) {
        const formatted = combinedDbMessages.map(m => ({
          id: m.id,
          role: m.sender_role as any,
          text: m.text,
          timestamp: new Date(m.created_at)
        }));
        setMessages(formatted);
      }
    } catch (err) {
      console.warn("Erro ao recarregar mensagens:", err);
    }
  }, [user.id]);

  useEffect(() => {
    const initializeChat = async () => {
      if (!user.id || hasInitialized.current) return;
      hasInitialized.current = true;
      setIsLoadingHistory(true);
      await checkAgentsAvailability();
      
      try {
        let isTicketOpen = false;
        try {
          const { data: ticket } = await supabase
            .from('support_tickets')
            .select('status')
            .eq('user_id', user.id)
            .eq('status', 'open')
            .maybeSingle();

          if (ticket?.status === 'open') isTicketOpen = true;
        } catch (err) {
          console.warn("Falha ao obter status do Supabase:", err);
        }

        // Tentar obter status no Fallback local
        try {
          const fbRes = await fetch('/api/fallback-tickets');
          if (fbRes.ok) {
            const fbTickets = await fbRes.json();
            const myFbTicket = fbTickets.find((t: any) => t.user_id === user.id);
            if (myFbTicket && myFbTicket.status === 'open') {
              isTicketOpen = true;
            }
          }
        } catch (err) {
          console.warn("Falha ao carregar status do fallback local:", err);
        }

        setIsHumanSupportActive(isTicketOpen);
        if (isTicketOpen) setConnectionStatus('online');

        let combinedDbMessages: any[] = [];
        try {
          const { data: dbMessages } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
          if (dbMessages) combinedDbMessages = [...dbMessages];
        } catch (err) {
          console.warn("Erro ao buscar histórico do Supabase, usando backup local:", err);
        }

        // Tentar obter histórico do Fallback local
        try {
          const fbRes = await fetch(`/api/fallback-messages/${user.id}`);
          if (fbRes.ok) {
            const fbMessages = await fbRes.json();
            fbMessages.forEach((fm: any) => {
              if (!combinedDbMessages.some(m => m.id === fm.id || (m.text === fm.text && Math.abs(new Date(m.created_at).getTime() - new Date(fm.created_at).getTime()) < 5000))) {
                combinedDbMessages.push(fm);
              }
            });
          }
        } catch (err) {
          console.warn("Erro ao buscar histórico do fallback local:", err);
        }

        combinedDbMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        if (combinedDbMessages.length > 0) {
          const formatted = combinedDbMessages.map(m => ({
            id: m.id,
            role: m.sender_role as any,
            text: m.text,
            timestamp: new Date(m.created_at)
          }));
          setMessages(formatted);
        } else {
          setMessages([{ 
            id: 'welcome', 
            role: 'ai', 
            text: "Olá! Sou a assistente da AtriosWork. Como posso ajudar com o seu controlo de horas no AtriosWork?", 
            timestamp: new Date() 
          }]);
        }
      } catch (err: any) {
        setErrorMessage("Erro ao carregar histórico.");
      } finally {
        setIsLoadingHistory(false);
        scrollToBottom("auto");
      }
    };

    initializeChat();
  }, [user.id, user.name, scrollToBottom, checkAgentsAvailability, t]);

  useEffect(() => {
    if (!user.id) return;

    const channel = supabase.channel(`atrioswork_chat_sync_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `user_id=eq.${user.id}` }, payload => {
        const msg = payload.new;
        if (!msg || !msg.id) return;

        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;

          if (msg.sender_role === 'user') {
            const tempIdx = prev.findIndex(m => m.role === 'user' && m.text === msg.text && String(m.id).startsWith('temp-'));
            if (tempIdx !== -1) {
              const newMessages = [...prev];
              newMessages[tempIdx] = { 
                id: msg.id, 
                role: msg.sender_role as any, 
                text: msg.text, 
                timestamp: new Date(msg.created_at) 
              };
              return newMessages;
            }
          }

          if (msg.sender_role === 'support') {
            setIsHumanSupportActive(true);
            setConnectionStatus('online');
          }

          return [...prev, { 
            id: msg.id, 
            role: msg.sender_role as any, 
            text: msg.text, 
            timestamp: new Date(msg.created_at) 
          }];
        });
        scrollToBottom();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` }, payload => {
        const updatedTicket = payload.new;
        if (updatedTicket.status === 'resolved') {
          setIsHumanSupportActive(false);
          setConnectionStatus('idle');
        } else if (updatedTicket.status === 'open') {
          setIsHumanSupportActive(true);
        }
      })
      .on('broadcast', { event: 'support_sync' }, (payload) => {
        console.log("[Support Sync] Atualizando mensagens via broadcast:", payload);
        reloadMessages();
      })
      .on('broadcast', { event: 'support_resolved' }, () => {
        console.log("[Support Sync] Suporte humano resolvido via admin!");
        setIsHumanSupportActive(false);
        setConnectionStatus('idle');
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user.id, scrollToBottom, checkAgentsAvailability, reloadMessages]);

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
      // 1. Tentar gravar mensagem de chat na DB
      try {
        const { error: msgErr } = await supabase.from('chat_messages').insert({ user_id: user.id, text: currentText, sender_role: 'user' });
        if (msgErr) console.warn("Aviso ao guardar mensagem de chat na DB (prosseguindo):", msgErr);
      } catch (dbErr) {
        console.warn("Falha física ao guardar mensagem de chat (prosseguindo):", dbErr);
      }

      // Gravar mensagem no Fallback local
      try {
        await fetch('/api/fallback-messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, text: currentText, sender_role: 'user' })
        });
      } catch (err) {
        console.warn("Erro ao salvar mensagem no fallback local:", err);
      }

      // 2. Tentar atualizar o ticket na DB
      try {
        const { error: ticketErr } = await supabase.from('support_tickets').update({ 
          last_message: currentText, 
          status: 'open',
          updated_at: new Date().toISOString() 
        }).eq('user_id', user.id);
        if (ticketErr) console.warn("Aviso ao atualizar ticket na DB (prosseguindo):", ticketErr);
      } catch (dbErr) {
        console.warn("Falha física ao atualizar ticket (prosseguindo):", dbErr);
      }

      // Atualizar ticket no Fallback local
      try {
        await fetch('/api/fallback-tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            user_id: user.id, 
            status: 'open', 
            last_message: currentText,
            user_name: user.name || 'Utilizador',
            user_email: user.email || ''
          })
        });
      } catch (err) {
        console.warn("Erro ao salvar ticket no fallback local:", err);
      }

      // 3. Tentar registar no histórico (app_banners)
      try {
        await supabase.from('app_banners').insert([{
          title: `[PUSH] 💬 Suporte: ${user.name || 'Utilizador'}`,
          highlight: `${user.name || 'Utilizador'}: "${currentText.substring(0, 60)}${currentText.length > 60 ? '...' : ''}"`,
          subtitle: 'Notificação de Suporte',
          cta_text: 'Atender',
          cta_link: '/',
          theme_color: 'blue',
          is_active: true,
          user_type: 'push_notification'
        }]);
      } catch (dbErr) {
        console.warn('Erro ao registrar push no histórico:', dbErr);
      }

      // 4. Disparar notificação push real FCM para admins (Sempre executado!)
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

      // Enviar broadcast de sincronização
      try {
        const syncChannel = supabase.channel(`atrioswork_chat_sync_${user.id}`);
        syncChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            syncChannel.send({
              type: 'broadcast',
              event: 'support_sync',
              payload: { user_id: user.id }
            });
            // Também para o canal global dos administradores
            const globalChannel = supabase.channel('atrioswork_support_global_sync');
            globalChannel.subscribe((st) => {
              if (st === 'SUBSCRIBED') {
                globalChannel.send({
                  type: 'broadcast',
                  event: 'support_request',
                  payload: { user_id: user.id }
                });
              }
            });
          }
        });
      } catch (broadcastErr) {
        console.warn("Erro ao enviar broadcast:", broadcastErr);
      }

      setIsSending(false);
      sendingRef.current = false;
    } else {
      setIsTyping(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // CORREÇÃO: Filtrar histórico para a IA garantindo que comece com 'user'
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
        
        // Guardar na DB
        try {
          await supabase.from('chat_messages').insert([
            { user_id: user.id, text: currentText, sender_role: 'user' },
            { user_id: user.id, text: aiText, sender_role: 'ai' }
          ]);
        } catch (dbErr) {
          console.warn("Erro ao guardar mensagens AI no Supabase:", dbErr);
        }

        // Guardar no Fallback local
        try {
          await fetch('/api/fallback-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, text: currentText, sender_role: 'user' })
          });
          await fetch('/api/fallback-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, text: aiText, sender_role: 'ai' })
          });
        } catch (err) {
          console.warn("Erro ao salvar mensagens AI no fallback local:", err);
        }

        // Enviar broadcast de sincronização
        try {
          const syncChannel = supabase.channel(`atrioswork_chat_sync_${user.id}`);
          syncChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              syncChannel.send({
                type: 'broadcast',
                event: 'support_sync',
                payload: { user_id: user.id }
              });
            }
          });
        } catch (broadcastErr) {
          console.warn("Erro ao enviar broadcast:", broadcastErr);
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

    // 1. Tentar gravar a mensagem de controle na DB
    try {
      const { error: msgErr } = await supabase.from('chat_messages').insert({ 
        user_id: user.id, 
        text: "--- SOLICITAÇÃO DE ATENDIMENTO HUMANO ---", 
        sender_role: 'user' 
      });
      if (msgErr) console.warn("Aviso ao guardar mensagem de suporte na DB (prosseguindo):", msgErr);
    } catch (dbErr) {
      console.warn("Falha física ao guardar mensagem de suporte (prosseguindo):", dbErr);
    }

    // Gravar no Fallback local
    try {
      await fetch('/api/fallback-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, text: "--- SOLICITAÇÃO DE ATENDIMENTO HUMANO ---", sender_role: 'user' })
      });
    } catch (err) {
      console.warn("Erro ao salvar mensagem no fallback local:", err);
    }

    // 2. Tentar atualizar ou criar o ticket de suporte
    try {
      const { data: updateData, error: updateErr } = await supabase
        .from('support_tickets')
        .update({ 
          status: 'open', 
          last_message: triggerText, 
          updated_at: new Date().toISOString() 
        })
        .eq('user_id', user.id)
        .select();

      if (updateErr || !updateData || updateData.length === 0) {
        const { error: insertErr } = await supabase.from('support_tickets').insert({ 
          user_id: user.id, 
          status: 'open', 
          last_message: triggerText, 
          updated_at: new Date().toISOString() 
        });
        if (insertErr) console.warn("Aviso ao criar ticket de suporte na DB (prosseguindo):", insertErr);
      }
    } catch (dbErr) {
      console.warn("Falha física ao gerir ticket de suporte (prosseguindo):", dbErr);
    }

    // Atualizar ticket no Fallback local
    try {
      await fetch('/api/fallback-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: user.id, 
          status: 'open', 
          last_message: triggerText,
          user_name: user.name || 'Utilizador',
          user_email: user.email || ''
        })
      });
    } catch (err) {
      console.warn("Erro ao salvar ticket no fallback local:", err);
    }

    // 3. Tentar registar no histórico (app_banners)
    try {
      await supabase.from('app_banners').insert([{
        title: `[PUSH] 💬 Suporte: ${user.name}`,
        highlight: `O utilizador ${user.name} (${user.email}) solicitou atendimento humano no chat.`,
        subtitle: 'Solicitação de Suporte Humano',
        cta_text: 'Atender',
        cta_link: '/',
        theme_color: 'rose',
        is_active: true,
        user_type: 'push_notification'
      }]);
    } catch (dbErr) {
      console.warn('Erro ao registrar push no histórico:', dbErr);
    }
    
    // 4. Disparar notificação push real FCM para admins (Sempre executado!)
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

    // Enviar broadcast de sincronização
    try {
      const syncChannel = supabase.channel(`atrioswork_chat_sync_${user.id}`);
      syncChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          syncChannel.send({
            type: 'broadcast',
            event: 'support_sync',
            payload: { user_id: user.id }
          });
          // Também para o canal global dos administradores
          const globalChannel = supabase.channel('atrioswork_support_global_sync');
          globalChannel.subscribe((st) => {
            if (st === 'SUBSCRIBED') {
              globalChannel.send({
                type: 'broadcast',
                event: 'support_request',
                payload: { user_id: user.id }
              });
            }
          });
        }
      });
    } catch (broadcastErr) {
      console.warn("Erro ao enviar broadcast:", broadcastErr);
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
