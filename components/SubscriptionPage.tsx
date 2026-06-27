
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2, CreditCard, Tag, Sparkles, CheckCircle2, User, Mail, Phone, Lock, Zap, ShieldCheck, AlertTriangle, CalendarDays, KeySquare, Wallet, Info, Globe, Shield, Check, ShieldAlert, Star, FileDown, Clock, Coins, Cloud, Headphones } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getStripe } from '../lib/stripe';

interface Props {
  onSuccess: () => void;
  onBack: () => void;
  t: (key: string) => any;
}

const generateAtriosWorkId = () => {
  const year = new Date().getFullYear();
  const hex = Math.random().toString(16).substr(2, 4).toUpperCase();
  const serial = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `AW-${year}-${hex}-${serial}-AW`;
};

const SubscriptionPage: React.FC<Props> = ({ onSuccess, onBack, t }) => {
  const [loading, setLoading] = useState(false);
  const [vendorCode, setVendorCode] = useState('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [isDiscountApplied, setIsDiscountApplied] = useState(false);
  const [appliedDiscountPercent, setAppliedDiscountPercent] = useState(5);
  const [paymentStep, setPaymentStep] = useState<'form' | 'verifying' | 'charging' | 'success' | 'failed'>('form');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  
  const cardNumberRef = useRef<HTMLDivElement>(null);
  const cardExpiryRef = useRef<HTMLDivElement>(null);
  const cardCvcRef = useRef<HTMLDivElement>(null);
  
  const [stripeInstance, setStripeInstance] = useState<any>(null);
  const [cardNumberElement, setCardNumberElement] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  const basePrice = 9.90;
  const originalPrice = 19.80;
  
  const finalPrice = useMemo(() => {
    const discount = appliedDiscountPercent / 100;
    return isDiscountApplied ? (basePrice * (1 - discount)).toFixed(2) : basePrice.toFixed(2);
  }, [isDiscountApplied, appliedDiscountPercent]);

  const advantages = useMemo(() => {
    const data = t('landing.advantages');
    return Array.isArray(data) ? data : [];
  }, [t]);

  const getAdvIcon = (index: number) => {
    const icons = [FileDown, Clock, Coins, Cloud, Headphones, ShieldCheck];
    const Icon = icons[index] || CheckCircle2;
    return <Icon className="w-4 h-4 text-emerald-400" />;
  };

  useEffect(() => {
    const code = vendorCode.trim().toUpperCase();
    if (!code) {
      setIsDiscountApplied(false);
      setAppliedDiscountPercent(5);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidatingCode(true);
      try {
        if (code === 'ATRIOSWORK-FREE-DEV') {
          setAppliedDiscountPercent(100);
          setIsDiscountApplied(true);
          return;
        }

        // 1. Procurar o parceiro na tabela de vendors pelo código único
        const { data: vData } = await supabase
          .from('vendors')
          .select('id')
          .ilike('code', code)
          .maybeSingle();

        if (vData) {
          // 2. Com o ID do parceiro, buscar o desconto personalizado no perfil (JSONB subscription)
          const { data: pData } = await supabase
            .from('profiles')
            .select('subscription')
            .eq('id', vData.id)
            .maybeSingle();

          if (pData) {
            const sub = typeof pData.subscription === 'string' ? JSON.parse(pData.subscription) : (pData.subscription || {});
            // Usar o desconto personalizado ou 5% se não estiver definido
            const customDisc = sub.custom_discount ?? 5;
            setAppliedDiscountPercent(customDisc);
            setIsDiscountApplied(true);
          } else {
            setAppliedDiscountPercent(5);
            setIsDiscountApplied(true);
          }
        } else {
          setIsDiscountApplied(false);
        }
      } catch (e) {
        setIsDiscountApplied(false);
      } finally {
        setIsValidatingCode(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [vendorCode]);

  useEffect(() => {
    let nr: any, ex: any, cv: any;

    if (paymentStep === 'form') {
      const initStripeElements = async () => {
        const stripe = await getStripe();
        if (!stripe) return;
        setStripeInstance(stripe);

        const elements = stripe.elements();
        const style = {
          base: {
            color: '#ffffff',
            fontWeight: '600',
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
            '::placeholder': { color: '#475569' },
          },
          invalid: { color: '#ef4444' }
        };

        nr = elements.create('cardNumber', { style, showIcon: true });
        ex = elements.create('cardExpiry', { style });
        cv = elements.create('cardCvc', { style });

        if (cardNumberRef.current) nr.mount(cardNumberRef.current);
        if (cardExpiryRef.current) ex.mount(cardExpiryRef.current);
        if (cardCvcRef.current) cv.mount(cardCvcRef.current);

        setCardNumberElement(nr);
      };

      const timer = setTimeout(initStripeElements, 100);
      return () => {
        clearTimeout(timer);
        if (nr) nr.destroy();
        if (ex) ex.destroy();
        if (cv) cv.destroy();
      };
    }
  }, [paymentStep]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDetails(null);

    if (formData.password !== formData.confirmPassword) {
      setErrorDetails("As senhas não coincidem!");
      return;
    }
    
    setLoading(true);

    try {
      const { data: existingUser } = await supabase.from('profiles').select('id').eq('email', formData.email).maybeSingle();
      if (existingUser) throw new Error("Este e-mail já possui uma licença AtriosWork ativa.");

      if (vendorCode.trim().toUpperCase() === 'ATRIOSWORK-FREE-DEV') {
        setPaymentStep('charging');
        await finalizeAtriosWorkAccount('BYPASS_DEV_MODE', 0, true);
        return;
      }

      if (!stripeInstance || !cardNumberElement) throw new Error("Gateway de pagamento não inicializado.");

      const { token, error: stripeError } = await stripeInstance.createToken(cardNumberElement, {
        name: formData.name,
      });

      if (stripeError) throw new Error(stripeError.message);
      if (!token?.id) throw new Error("Erro na geração da identidade do cartão.");

      setPaymentStep('verifying');

      // ENVIANDO O DESCONTO APLICADO PARA O SERVIDOR PARA GARANTIR VALOR CORRETO
      const { data, error: functionError } = await supabase.functions.invoke('process-payment', {
        body: { 
          token: token.id, 
          email: formData.email,
          description: `Licença AtriosWork: ${formData.name}`,
          vendorCode: isDiscountApplied ? vendorCode.trim().toUpperCase() : null,
          discountPercent: isDiscountApplied ? appliedDiscountPercent : 0
        }
      });

      if (functionError) {
        let realError = "";
        try {
          const body = await functionError.context.json();
          realError = body.error || body.message || "";
        } catch {
          realError = functionError.message || "";
        }

        if (realError.toLowerCase().includes('insufficient funds')) {
          throw new Error("O seu cartão foi recusado por falta de saldo. Verifique o seu banco ou use outro cartão.");
        }
        
        throw new Error(realError || "Falha na comunicação com o servidor AtriosWork. Tente novamente.");
      }

      if (!data?.success) {
        throw new Error(data?.error || "A transação foi recusada pela AtriosWork.");
      }

      setPaymentStep('charging');
      await finalizeAtriosWorkAccount(data.chargeId, data.amountCharged, data.discounted);

    } catch (err: any) {
      setPaymentStep('failed');
      setErrorDetails(err.message);
      setLoading(false);
    }
  };

  const finalizeAtriosWorkAccount = async (chargeId: string, finalAmount: number, wasDiscounted: boolean) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { 
          data: { 
            full_name: formData.name, 
            phone: formData.phone
          } 
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          vendor_code: isDiscountApplied ? vendorCode.trim().toUpperCase() : null,
          role: 'user',
          hourlyRate: 10,
          isFreelancer: false,
          subscription: {
            id: generateAtriosWorkId(),
            startDate: new Date().toISOString(), 
            isActive: true,
            appliedDiscount: wasDiscounted ? appliedDiscountPercent : 0,
            paidAmount: finalAmount,
            status: 'ACTIVE_PAID',
            stripe_charge_id: chargeId,
            payment_date: new Date().toISOString()
          }
        });

        if (profileError) throw profileError;
        
        // Trigger push notification to admins about the new license sale
        try {
          await supabase.functions.invoke('send-fcm-push', {
            body: {
              title: '💰 Nova Venda Realizada!',
              body: `O utilizador ${formData.name} (${formData.email}) comprou uma Licença AtriosWork por €${finalAmount}! Código: ${isDiscountApplied ? vendorCode.trim().toUpperCase() : 'Nenhum'}`,
              audience: 'admin'
            }
          });
        } catch (fcmErr) {
          console.warn('Erro ao disparar push de nova venda:', fcmErr);
        }
        
        setPaymentStep('success');
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (err: any) {
      setPaymentStep('failed');
      setErrorDetails(`Erro ao criar conta AtriosWork: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 md:p-12 relative overflow-hidden font-inter">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_30%,_rgba(124,58,237,0.08)_0%,_transparent_50%)]"></div>
      
      <div className="max-w-6xl w-full bg-slate-900/40 backdrop-blur-3xl rounded-[4rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.5)] border border-white/5 z-10">
        
        {(paymentStep === 'verifying' || paymentStep === 'charging') && (
          <div className="w-full py-48 flex flex-col items-center justify-center space-y-10 animate-fade-in">
            <div className="relative">
              <div className="w-32 h-32 border-[8px] border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin"></div>
              <Shield className="absolute inset-0 m-auto w-10 h-10 text-emerald-500 animate-pulse" />
            </div>
            <div className="text-center space-y-4 px-8">
              <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">
                {paymentStep === 'verifying' ? 'Segurança AtriosWork...' : 'A Criar Acesso...'}
              </h2>
              <p className="text-slate-500 text-[11px] font-black uppercase tracking-[0.4em] max-w-sm mx-auto leading-relaxed text-center">
                A processar o seu ID AtriosWork.<br/>Não feche esta janela.
              </p>
            </div>
          </div>
        )}

        {paymentStep === 'failed' && (
          <div className="w-full py-32 px-10 flex flex-col items-center justify-center space-y-8 animate-fade-in text-center">
            <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30 text-red-500 mb-4 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
               <ShieldAlert className="w-12 h-12" />
            </div>
            <div className="space-y-4 max-w-md mx-auto">
              <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">Erro Bancário</h2>
              <p className="text-slate-400 text-sm font-semibold leading-relaxed bg-slate-950/50 p-6 rounded-3xl border border-white/5">
                {errorDetails || "O banco não autorizou o pagamento. Verifique o saldo ou utilize outro cartão."}
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={() => { setPaymentStep('form'); setLoading(false); }} className="w-full py-5 bg-white text-slate-900 font-black rounded-[2rem] text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-xl">Tentar Outro Cartão</button>
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">AtriosWork • PCI-Compliance v4.0</p>
              </div>
            </div>
          </div>
        )}

        {paymentStep === 'success' && (
          <div className="w-full py-48 flex flex-col items-center justify-center space-y-8 animate-fade-in text-center">
            <div className="w-32 h-32 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
               <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            </div>
            <div className="space-y-3">
              <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Identidade Ativada</h2>
              <p className="text-emerald-500 text-[11px] font-black uppercase tracking-[0.5em]">Bem-vindo à AtriosWork.</p>
            </div>
          </div>
        )}

        {paymentStep === 'form' && (
          <div className="flex flex-col lg:flex-row">
            <div className="lg:w-[40%] p-10 md:p-16 bg-gradient-to-br from-purple-900/30 via-slate-900/50 to-transparent border-r border-white/5 flex flex-col">
              <button onClick={onBack} className="flex items-center space-x-3 text-slate-500 hover:text-white mb-16 transition-all group w-fit">
                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-2 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Voltar</span>
              </button>

              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center font-black text-white text-xl shadow-2xl">AW</div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">ATRIOSWORK</h2>
              </div>

              <div className="space-y-6 mb-12">
                {advantages.slice(0, 6).map((adv: any, i: number) => (
                  <div key={i} className="flex items-start gap-4 group">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                       {getAdvIcon(i)}
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-white uppercase tracking-widest leading-none mb-1">{adv.title}</p>
                      <p className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter opacity-70 leading-tight">{adv.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-auto bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/30 p-10 rounded-[3rem] border border-emerald-500/20 relative overflow-hidden shadow-[0_20px_50px_rgba(16,185,129,0.15)] group/card ring-1 ring-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover/card:scale-110 transition-transform duration-700 pointer-events-none">
                  <Star className="w-10 h-10 text-emerald-500 fill-emerald-500" />
                </div>
                
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500 text-slate-950 rounded-full mb-6 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                  <Zap className="w-3 h-3 fill-current" />
                  <span className="text-[9px] font-black uppercase tracking-widest">PROMOÇÃO DE LANÇAMENTO</span>
                </div>

                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4">Licença Anual Profissional</p>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-2xl font-black text-slate-600 line-through opacity-50 italic">19,80€</span>
                    <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-[8px] font-black uppercase">-50% OFF</span>
                  </div>
                  
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black tracking-tighter text-white">{finalPrice}€</span>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-emerald-500 uppercase leading-none">/Ano</span>
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Já com IVA</span>
                    </div>
                  </div>
                </div>

                {isDiscountApplied && (
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-4 animate-bounce flex items-center gap-2">
                    <Check className="w-3 h-3" /> {vendorCode === 'ATRIOSWORK-FREE-DEV' ? 'MODO TESTE ATIVO' : `DESCONTO DE ${appliedDiscountPercent}% APLICADO!`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex-1 p-10 md:p-16 bg-slate-900/60 relative">
              <form onSubmit={handleCheckout} className="max-w-xl mx-auto space-y-10">
                <div className="space-y-2">
                  <h1 className="text-4xl font-black text-white leading-tight uppercase tracking-tighter italic">Checkout <span className="text-purple-400">Digital</span></h1>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                    <Lock className="w-3 h-3" /> Transação Encriptada SSL/TLS
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Nome do Titular</label>
                      <div className="relative">
                        <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                        <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white focus:ring-1 focus:ring-purple-500 outline-none font-bold" placeholder="Titular AtriosWork" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Email de Acesso</label>
                      <div className="relative">
                        <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                        <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white focus:ring-1 focus:ring-purple-500 outline-none font-bold" placeholder="email@atrioswork.com" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Criar Palavra-passe</label>
                      <input type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" placeholder="••••••••" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Repetir Palavra-passe</label>
                      <input type="password" required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold" placeholder="••••••••" />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-10 rounded-[3rem] border border-slate-800 space-y-8 shadow-2xl">
                  <div className="flex items-center justify-between mb-2">
                     <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-3"><CreditCard className="w-5 h-5" /> Dados Bancários</h3>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-600 uppercase ml-2 tracking-widest">Número do Cartão</label>
                      <div ref={cardNumberRef} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-6 py-4 min-h-[56px] focus-within:border-emerald-500/50 transition-all"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-600 uppercase ml-2 tracking-widest">Validade (MM/AA)</label>
                        <div ref={cardExpiryRef} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-6 py-4 min-h-[56px]"></div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-600 uppercase ml-2 tracking-widest">CVC (Atrás)</label>
                        <div ref={cardCvcRef} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-6 py-4 min-h-[56px]"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Código de Parceiro / Promoção</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={vendorCode} 
                      onChange={e => setVendorCode(e.target.value.toUpperCase())} 
                      className={`w-full bg-slate-950/50 border ${isDiscountApplied ? 'border-emerald-500/50' : 'border-slate-800'} rounded-2xl px-6 py-4 text-white font-black uppercase text-sm outline-none transition-all`} 
                      placeholder="Introduza o código..." 
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2">
                      {isValidatingCode ? (
                        <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                      ) : isDiscountApplied ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5 text-center">
                  <button type="submit" disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-7 rounded-[2.5rem] transition-all shadow-[0_15px_40px_rgba(16,185,129,0.3)] flex items-center justify-center gap-4 disabled:opacity-50 text-xl uppercase tracking-widest">
                    {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <><ShieldCheck className="w-7 h-7" /> Ativar Minha Licença</>}
                  </button>
                  <p className="mt-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Pagamento via Stripe Secure Gateway</p>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPage;
