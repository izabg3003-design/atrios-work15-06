import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquare, X, Send, Bot, User, Loader2, Sparkles, 
  Headphones, Mail, CheckCircle2, AlertTriangle, Fingerprint, ArrowRight 
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { supabase, supabaseAnonKey, invokeSendPush } from '../lib/supabase';

interface Message {
  role: 'user' | 'ai' | 'support';
  text: string;
}

const PublicSupportChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [step, setStep] = useState<'form' | 'chat'>('form');
  const [userData, setUserData] = useState({ name: '', email: '' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isAgentsOnline, setIsAgentsOnline] = useState<boolean | null>(null);
  const [showHumanSupportStatus, setShowHumanSupportStatus] = useState(false);
  const [isHumanModeActive, setIsHumanModeActive] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  // Timer para o Balão de Incentivo (Nudge)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) setShowNudge(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // 1. Verificar Agentes Online
  const checkAgents = useCallback(async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .or(`role.in.(support,admin),email.ilike.master@atrioswork.com,email.ilike.izarelleBraga@gmail.com,email.ilike.master@digitalnexus.com`)
        .gt('updated_at', fiveMinutesAgo);
      
      setIsAgentsOnline((count || 0) > 0);
    } catch (e) {
      setIsAgentsOnline(false);
    }
  }, []);

  // 2. Setup de Realtime e Recuperação de Sessão
  useEffect(() => {
    if (!isOpen) return;
    checkAgents();
    setShowNudge(false);

    const setupSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const uid = session.user.id;
        setVisitorId(uid);
        
        const { data: history } = await supabase
          .from('chat_messages')
          .select('sender_role, text')
          .eq('user_id', uid)
          .order('created_at', { ascending: true });
        
        if (history && history.length > 0) {
          const formatted = history.map(m => ({
            role: m.sender_role as any,
            text: m.text
          }));
          setMessages(formatted);
          setStep('chat');
          
          if (formatted.some(m => m.role === 'support')) {
            setIsHumanModeActive(true);
            setShowHumanSupportStatus(true);
          }
        }
      }
    };

    setupSession();
  }, [isOpen, checkAgents]);

  // 3. Listener Realtime para mensagens do suporte
  useEffect(() => {
    if (!visitorId || !isOpen) return;

    const channel = supabase.channel(`atrioswork_visitor_chat_${visitorId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages', 
        filter: `user_id=eq.${visitorId}` 
      }, (payload) => {
        const newMsg = payload.new;
        if (newMsg.sender_role === 'support') {
          setMessages(prev => {
            if (prev.some(m => m.text === newMsg.text && m.role === 'support')) return prev;
            return [...prev, { role: 'support', text: newMsg.text }];
          });
          setIsHumanModeActive(true);
          setShowHumanSupportStatus(true);
          scrollToBottom();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visitorId, isOpen, scrollToBottom]);

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData.name.trim() || !userData.email.trim()) return;
    
    setStep('chat');
    if (messages.length === 0) {
      setMessages([{ 
        role: 'ai', 
        text: `Olá ${userData.name.split(' ')[0]}! Sou a assistente virtual da AtriosWork. Em que posso ajudar hoje?` 
      }]);
    }
    scrollToBottom();
  };

  const syncToSupport = async (text: string) => {
    try {
      const cleanEmail = userData.email.trim().toLowerCase();
      let targetId = visitorId;
      if (!targetId) {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw anonError;
        targetId = anonData.user?.id;
        setVisitorId(targetId);
      }

      if (!targetId) return false;

      await supabase.from('profiles').upsert({
        id: targetId,
        name: userData.name.trim(),
        email: cleanEmail,
        role: 'user',
        hourlyRate: 0,
        isFreelancer: false,
        subscription: { status: 'GUEST_VISITOR', isActive: true, startDate: new Date().toISOString() }
      }, { onConflict: 'id' });

      await supabase.from('support_tickets').upsert({
        user_id: targetId,
        status: 'open',
        last_message: text,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

      await supabase.from('chat_messages').insert({
        user_id: targetId,
        text: text,
        sender_role: 'user'
      });
      
      // Log notification in history (app_banners) and trigger push
      try {
        await supabase.from('app_banners').insert([{
          title: `[PUSH] 💬 Visitante: ${userData.name.trim()}`,
          highlight: `${userData.name.trim()} (Visitante): "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`,
          subtitle: 'Notificação de Visitante',
          cta_text: 'Atender',
          cta_link: '/',
          theme_color: 'rose',
          is_active: true,
          user_type: 'push_notification'
        }]);
      } catch (dbErr) {
        console.error('Erro ao registrar push no histórico:', dbErr);
      }
      
      // Trigger push notification to admins about the new guest support message
      try {
        await invokeSendPush({
          title: '💬 Novo Chat com Visitante!',
          body: `${userData.name.trim()} (Visitante): "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`,
          audience: 'admin'
        });
      } catch (fcmErr) {
        console.warn('Erro ao disparar push de mensagem de visitante:', fcmErr);
      }
      
      return true;
    } catch (err: any) {
      console.error("AtriosWork Sync Error:", err.message);
      return false;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentText = inputText.trim();
    if (!currentText || isSending) return;

    setInputText('');
    setIsSending(true);
    setMessages(prev => [...prev, { role: 'user', text: currentText }]);
    scrollToBottom();

    if (isHumanModeActive) {
      const success = await syncToSupport(currentText);
      if (!success) {
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: "Erro ao conectar. Por favor, envie um e-mail para software.atrios@gmail.com." 
        }]);
      }
      setIsSending(false);
      return;
    }

    setIsTyping(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const rawHistory = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      const firstUserIdx = rawHistory.findIndex(h => h.role === 'user');
      const history = firstUserIdx !== -1 ? rawHistory.slice(firstUserIdx) : [];

      const systemInstruction = `Tu és a assistente virtual da AtriosWork. Estás a falar com ${userData.name}.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...history, { role: 'user', parts: [{ text: currentText }] }],
        config: { systemInstruction, temperature: 0.7 }
      });

      const aiText = response.text || "Pode repetir?";
      setMessages(prev => [...prev, { role: 'ai', text: aiText }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: "IA ocupada. Deseja suporte humano?" }]);
    } finally {
      setIsTyping(false);
      setIsSending(false);
      scrollToBottom();
    }
  };

  const requestHumanSupport = async () => {
    setIsSending(true);
    await checkAgents();
    
    const success = await syncToSupport(`[VISITANTE] ${userData.name} solicitou atendimento humano.`);
    
    if (success) {
      setShowHumanSupportStatus(true);
      setIsHumanModeActive(true);
    } else {
      setMessages(prev => [...prev, { role: 'ai', text: "Erro ao abrir ticket. Contacte software.atrios@gmail.com" }]);
    }
    
    setIsSending(false);
    scrollToBottom();
  };

  return (
    <div className="no-print fixed bottom-28 md:bottom-6 right-6 z-[2000] font-inter flex flex-col items-end">
      {/* AtriosWork Incentive Nudge */}
      {showNudge && !isOpen && (
        <div className="mb-4 mr-2 animate-[slideUp_0.5s_ease-out]">
          <div className="bg-slate-900 border border-emerald-500/30 px-6 py-4 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">
            <button 
              onClick={() => setShowNudge(false)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-slate-800 text-slate-500 rounded-full flex items-center justify-center hover:text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Dúvida sobre a licença?</p>
            <p className="text-white text-xs font-bold leading-tight">Fale agora com a nossa IA ou um consultor humano. <span className="inline-block animate-bounce ml-1">👇</span></p>
            {/* Seta do balão */}
            <div className="absolute -bottom-2 right-8 w-4 h-4 bg-slate-900 border-r border-b border-emerald-500/30 rotate-45"></div>
          </div>
        </div>
      )}

      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-full shadow-[0_15px_40px_rgba(16,185,129,0.4)] flex items-center justify-center transition-all hover:scale-110 active:scale-95 group relative"
        >
          <MessageSquare className="w-7 h-7 group-hover:rotate-12 transition-transform" />
          {showNudge && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-950 animate-pulse"></div>
          )}
        </button>
      )}

      {isOpen && (
        <div className="bg-slate-900 border border-white/10 w-[350px] md:w-[400px] h-[580px] rounded-[2.5rem] shadow-[0_30px_90px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden animate-[modalScale_0.3s_ease-out]">
          <div className="p-6 bg-gradient-to-r from-slate-950 to-slate-900 border-b border-white/5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/20">
                {isHumanModeActive ? <Headphones className="w-5 h-5 text-emerald-400" /> : <Bot className="w-5 h-5 text-emerald-400" />}
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase italic tracking-tighter">AtriosWork <span className="text-emerald-400">{isHumanModeActive ? 'Human' : 'Support'}</span></h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isAgentsOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{isAgentsOnline ? 'Operação Online' : 'Suporte Limitado'}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {step === 'form' ? (
              <form onSubmit={handleStartChat} className="space-y-6 pt-4 animate-[fadeIn_0.4s_ease-out]">
                <div className="text-center space-y-2 mb-6">
                  <Fingerprint className="w-10 h-10 text-emerald-500/40 mx-auto" />
                  <h4 className="text-white font-bold text-sm uppercase">Identificação AtriosWork</h4>
                  <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Inicie o suporte especializado</p>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">O seu Nome</label>
                    <input required type="text" value={userData.name} onChange={e => setUserData({...userData, name: e.target.value})} className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3.5 text-white text-sm outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Ex: João" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">E-mail de Contacto</label>
                    <input required type="email" value={userData.email} onChange={e => setUserData({...userData, email: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm outline-none focus:ring-1 focus:ring-emerald-500" placeholder="seu@email.com" />
                  </div>
                </div>

                <button type="submit" className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
                  INICIAR CONVERSA <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <>
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-[slideUp_0.3s_ease-out]`}>
                    <div className={`p-4 rounded-2xl max-w-[85%] text-sm shadow-lg ${m.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-none' : m.role === 'support' ? 'bg-blue-600 text-white rounded-tl-none border border-blue-400/30' : 'bg-slate-950 border border-white/5 text-slate-200 rounded-tl-none'}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}

                {showHumanSupportStatus && (
                  <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3 animate-[fadeIn_0.3s_ease-out]">
                    <div className="flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Canal Direto Ativo</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                      {isAgentsOnline === false 
                        ? "A nossa equipa está a caminho! Responderemos em poucos segundos, aguarde um momento." 
                        : "Conectado à equipa de suporte AtriosWork. Aguarde a resposta de um consultor."}
                    </p>
                  </div>
                )}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {step === 'chat' && (
            <div className="p-4 bg-slate-950/50 border-t border-white/5 space-y-3">
              {!isHumanModeActive && (
                <button onClick={requestHumanSupport} disabled={isSending} className="w-full py-2 text-[8px] font-black text-slate-500 uppercase tracking-widest hover:text-emerald-400 transition-colors flex items-center justify-center gap-2">
                  {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Headphones className="w-3 h-3" />} Falar com Consultor Humano
                </button>
              )}
              <form onSubmit={handleSend} className="flex gap-2">
                <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} disabled={isSending} className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50" placeholder="Mensagem..." />
                <button type="submit" disabled={!inputText.trim() || isSending} className="p-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg transition-all disabled:opacity-20">
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes modalScale { from { transform: scale(0.9) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default PublicSupportChat;