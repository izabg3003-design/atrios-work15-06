import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, CheckCircle2, Sparkles, ShieldCheck, Zap, Clock, Wallet, Mail, ShieldAlert, Star, TrendingUp, FileText, Quote, Globe, Info, Megaphone, X, BarChart3, Users, Laptop, MousePointerClick, Facebook
} from 'lucide-react';
import { Language, AppBanner } from '../types';
import { supabase, parseDbBanner } from '../lib/supabase';

interface Props {
  onLogin: () => void;
  onSubscribe: () => void;
  onFreeRegister: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onAbout: () => void;
  t: (key: string) => any;
  lang: Language;
  setLang: (l: Language) => void;
}

const LandingPage: React.FC<Props> = ({ onLogin, onSubscribe, onFreeRegister, onPrivacy, onTerms, onAbout, t, lang, setLang }) => {
  const [scrolled, setScrolled] = useState(false);
  const [activeBanners, setActiveBanners] = useState<AppBanner[]>([]);
  const [showBannerOverlay, setShowBannerOverlay] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    
    const fetchBanners = async () => {
      try {
        const { data, error } = await supabase.from('app_banners').select('*').eq('is_active', true).order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          const publicBanners = data.map(parseDbBanner).filter(b => b.user_type === 'public');
          if (publicBanners.length > 0) {
            setActiveBanners(publicBanners);
            setTimeout(() => setShowBannerOverlay(true), 1500);
          }
        }
      } catch (e) {
        console.warn("AtriosWork Banners: Tabela não configurada ou inacessível.");
      }
    };
    fetchBanners();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const BannerOverlay = () => {
    if (!showBannerOverlay || activeBanners.length === 0) return null;
    const banner = activeBanners[0];

    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 backdrop-blur-md bg-slate-950/60 animate-[fadeIn_0.3s_ease-out]">
        <div className={`relative w-full max-w-4xl bg-slate-900 rounded-[3rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-${banner.theme_color}-500/30 animate-[modalScale_0.4s_ease-out]`}>
          <button 
            onClick={() => setShowBannerOverlay(false)}
            className="absolute top-6 right-6 z-50 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md transition-all border border-white/10"
          >
            <X className="w-6 h-6" />
          </button>

          {banner.image_url ? (
            <div className="relative aspect-[16/10] md:aspect-[16/9]">
              <img src={banner.image_url} className="w-full h-full object-cover" alt={banner.title} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>
            </div>
          ) : (
            <div className="p-12 md:p-20 text-center flex flex-col items-center justify-center min-h-[450px]">
              <div className={`w-24 h-24 rounded-3xl bg-${banner.theme_color}-500/10 border border-${banner.theme_color}-500/20 flex items-center justify-center`}>
                 <Megaphone className={`w-10 h-10 text-${banner.theme_color}-400`} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 overflow-x-hidden selection:bg-emerald-500/30 font-inter">
      <BannerOverlay />
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[100%] h-[50%] bg-emerald-600/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-5%] right-[-5%] w-[100%] h-[50%] bg-purple-600/5 rounded-full blur-[120px]"></div>
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${scrolled ? 'py-4 bg-slate-950/90 backdrop-blur-xl border-b border-white/5' : 'py-8 bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo_atualizado.jpg?v=20260314_v1" className="w-10 h-10 object-contain rounded-xl shadow-lg" alt="AtriosWork Logo" />
            <span className="font-bold text-xl tracking-tighter text-white">Atrios<span className="text-emerald-400">Work</span></span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={onAbout} className="hidden md:block text-[11px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-colors">A Empresa</button>
            <button onClick={onLogin} className="text-[11px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-colors">Acesso Membro</button>
            <button onClick={onSubscribe} className="px-6 py-3 bg-emerald-500 text-slate-950 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 hover:bg-emerald-400">Ativar Licença</button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* HERO SECTION - Otimizada para SEO: App de Controlo de Horas */}
        <section className="pt-48 md:pt-64 pb-20 px-6 text-center">
          <div className="max-w-4xl mx-auto space-y-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 italic">AtriosWork • Especialistas em Horário de Trabalho Portugal</span>
            </div>
            
            <h1 className="text-6xl md:text-9xl font-black tracking-tight text-white leading-[0.85] uppercase italic">
              Controlo de Horas <br/>
              <span className="text-gradient">de Trabalho.</span>
            </h1>
            
            <p className="text-lg md:text-2xl text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
              O AtriosWork Pro é o <strong>app de controlo de horas de trabalho</strong> ideal para quem precisa de <strong>registar horas extra</strong>, organizar pagamentos e gerar o <strong>relatório de horas para o IRS em Portugal</strong>.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
               <button 
                 onClick={onFreeRegister} 
                 className="w-full sm:w-auto px-12 py-7 rounded-2xl font-black uppercase text-xs tracking-[0.2em] text-slate-950 shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 btn-gold-shine"
               >
                 Experimentar grátis
               </button>
               <button onClick={onAbout} className="w-full sm:w-auto px-12 py-7 bg-slate-900 border border-white/10 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-3">
                 <Info className="w-4 h-4" /> Gestão de Horários
               </button>
            </div>
          </div>
        </section>

        {/* TRUST SECTION - Resolvendo dores reais do utilizador */}
        <section className="py-32 px-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { 
                icon: ShieldCheck, 
                title: "Código do Trabalho", 
                desc: "Totalmente alinhado com o horário de trabalho em Portugal. Registe entradas, saídas e pausas com segurança jurídica.",
                color: "emerald"
              },
              { 
                icon: BarChart3, 
                title: "Calcular Horas", 
                desc: "Esqueça a folha de horas trabalho manual. Deixe que a nossa aplicação registo de horas faça as contas por si em tempo real.",
                color: "purple"
              },
              { 
                icon: Laptop, 
                title: "App Horas Extra", 
                desc: "Ideal para recibos verdes e controlo de horas em trabalho por turnos Portugal. Gestão completa na AtriosWork Cloud.",
                color: "blue"
              },
            ].map((item, i) => (
              <article key={i} className="glass p-12 rounded-[3.5rem] border-white/5 hover:border-emerald-500/20 transition-all group flex flex-col items-center text-center space-y-6">
                 <div className={`w-16 h-16 rounded-2xl bg-${item.color}-500/10 flex items-center justify-center border border-${item.color}-500/20 group-hover:scale-110 transition-transform`}>
                    <item.icon className={`w-8 h-8 text-${item.color}-400`} />
                 </div>
                 <h2 className="text-xl font-black text-white uppercase italic tracking-widest">{item.title}</h2>
                 <p className="text-sm text-slate-500 leading-relaxed font-medium uppercase tracking-tight opacity-80">{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* SEO CONTENT SECTION - Porquê escolher o AtriosWork? */}
        <section className="py-32 px-6 bg-slate-950/40 border-y border-white/5">
           <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
              <div className="space-y-12">
                 <div className="space-y-6">
                   <h3 className="text-4xl md:text-6xl font-black text-white italic tracking-tighter uppercase leading-tight">
                     Diga adeus ao <br/> <span className="text-emerald-400">registo em papel.</span>
                   </h3>
                   <p className="text-slate-400 text-lg leading-relaxed">
                     Muitos profissionais reclamam: <strong>"não me pagaram horas extra"</strong>. Isso acontece por falta de prova. Com o AtriosWork, a <strong>gestão de horas trabalhadas</strong> é atómica. Saiba <strong>como calcular horas extra</strong> sem margem para erro e evite qualquer <strong>erro no pagamento do salário</strong>.
                   </p>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    {[
                      { icon: Clock, label: "Registo de Trabalho", sub: "Controlo de horários preciso" },
                      { icon: FileText, label: "Relatórios IRS", sub: "Prontos para contabilista" },
                      { icon: Wallet, label: "Organizar Pagamentos", sub: "Controlo de vales e taxas" },
                      { icon: Users, label: "Recibos Verdes", sub: "Ideal para freelancers" },
                    ].map((feat, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="w-10 h-10 bg-slate-900 rounded-xl border border-white/5 flex items-center justify-center shrink-0">
                           <feat.icon className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                           <p className="text-sm font-black text-white uppercase tracking-widest leading-none">{feat.label}</p>
                           <p className="text-[10px] font-bold text-slate-500 uppercase mt-1 tracking-tighter">{feat.sub}</p>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
              
              {/* Mockup Preview Visual */}
              <div className="relative">
                 <div className="absolute inset-0 bg-emerald-500/10 blur-[100px] -z-10 rounded-full animate-pulse"></div>
                 <div className="glass p-8 rounded-[4rem] border-white/10 shadow-2xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-700">
                    <div className="flex justify-between items-center mb-10">
                       <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500/40"></div>
                          <div className="w-3 h-3 rounded-full bg-amber-500/40"></div>
                          <div className="w-3 h-3 rounded-full bg-green-500/40"></div>
                       </div>
                       <div className="px-4 py-1 bg-slate-800 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">App Controlo de Trabalho</div>
                    </div>
                    <div className="space-y-6">
                       <div className="h-4 w-3/4 bg-slate-800 rounded-full animate-pulse"></div>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="h-24 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 flex flex-col items-center justify-center gap-2">
                             <TrendingUp className="w-6 h-6 text-emerald-400" />
                             <div className="h-2 w-12 bg-emerald-400/20 rounded-full"></div>
                          </div>
                          <div className="h-24 bg-purple-500/5 rounded-3xl border border-purple-500/10 flex flex-col items-center justify-center gap-2">
                             <Zap className="w-6 h-6 text-purple-400" />
                             <div className="h-2 w-12 bg-purple-400/20 rounded-full"></div>
                          </div>
                       </div>
                       <div className="h-3 w-full bg-slate-800 rounded-full"></div>
                       <div className="h-3 w-5/6 bg-slate-800 rounded-full opacity-50"></div>
                    </div>
                 </div>
              </div>
           </div>
        </section>

        {/* CALL TO ACTION FINAL */}
        <section className="py-40 px-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-emerald-500/5 -z-10 animate-pulse"></div>
          <div className="max-w-4xl mx-auto space-y-12">
            <h2 className="text-5xl md:text-8xl font-black text-white italic tracking-tighter uppercase leading-[0.8]">
              DOMINE CADA <br/><span className="text-emerald-400">HORA TRABALHADA.</span>
            </h2>
            <p className="text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto">
              Junte-se a milhares de profissionais que usam a melhor <strong>aplicação registo de horas</strong> da AtriosWork. Segurança Cloud, Inteligência Fiscal e Mobilidade para o seu sucesso.
            </p>
            <div className="max-w-sm mx-auto">
               <button onClick={onSubscribe} className="w-full px-12 py-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-[2.5rem] text-xl shadow-[0_30px_60px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 transition-all uppercase tracking-widest flex items-center justify-center gap-4">
                <span>Ativar AtriosWork Pro</span>
                <ArrowRight className="w-8 h-8" />
              </button>
            </div>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Cancelamento flexível • App Gestão de Horários 24/7</p>
          </div>
        </section>
      </main>

      {/* FOOTER - Professional & SEO Ready */}
      <footer className="py-24 px-6 border-t border-white/5 bg-slate-950">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-1 md:col-span-1 space-y-6 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <img src="/logo_atualizado.jpg?v=20260314_v1" className="w-8 h-8 object-contain rounded-lg" alt="AtriosWork Logo" />
                <span className="font-bold text-lg tracking-tighter text-white">AtriosWork</span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                A infraestrutura definitiva para controlo de horas manual ou digital. Uma divisão da AtriosWork.
              </p>
            </div>
            
            <div className="space-y-6 text-center md:text-left">
               <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Funcionalidades</h4>
               <ul className="space-y-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <li><button onClick={onLogin} className="hover:text-emerald-400 transition-colors">Controlo de Pagamentos</button></li>
                  <li><button onClick={onSubscribe} className="hover:text-emerald-400 transition-colors">Cálculo de Horas</button></li>
                  <li><button onClick={onAbout} className="hover:text-emerald-400 transition-colors">Registo de Horas Extra</button></li>
               </ul>
            </div>

            <div className="space-y-6 text-center md:text-left">
               <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Legal</h4>
               <ul className="space-y-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <li><button onClick={onPrivacy} className="hover:text-emerald-400 transition-colors">Privacidade</button></li>
                  <li><button onClick={onTerms} className="hover:text-emerald-400 transition-colors">Termos de Uso</button></li>
                  <li><button onClick={onTerms} className="hover:text-emerald-400 transition-colors">Código do Trabalho</button></li>
               </ul>
            </div>

            <div className="space-y-6 text-center md:text-left">
               <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Suporte</h4>
               <ul className="space-y-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <li><a href="mailto:software.atrios@gmail.com" className="hover:text-emerald-400 transition-colors">Apoio ao Cliente</a></li>
                  <li><button onClick={onAbout} className="hover:text-emerald-400 transition-colors">Parcerias AtriosWork</button></li>
                  <li><a href="https://www.facebook.com/share/1CSeJPHprp/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 transition-colors flex items-center justify-center md:justify-start gap-2"><Facebook className="w-3 h-3" /> Facebook</a></li>
               </ul>
            </div>
          </div>

          <div className="max-w-7xl mx-auto pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[10px] font-bold text-slate-700 uppercase tracking-[0.5em]">© 2026 AtriosWork. Líder em Controlo de Horas de Trabalho.</p>
            <div className="flex gap-6 opacity-30 grayscale hover:grayscale-0 transition-all items-center">
               <a href="https://www.facebook.com/share/1CSeJPHprp/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 transition-colors">
                  <Facebook className="w-5 h-5" />
               </a>
               <Globe className="w-5 h-5 text-slate-500" />
               <MousePointerClick className="w-5 h-5 text-slate-500" />
            </div>
          </div>
      </footer>

      <style>{`
        @keyframes modalScale {
          from { transform: scale(0.9) translateY(20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes shine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .btn-gold-shine {
          background: linear-gradient(90deg, #d4af37, #f9f295, #d4af37, #f9f295, #d4af37);
          background-size: 200% auto;
          animation: shine 3s linear infinite;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .btn-gold-shine:hover {
          filter: brightness(1.1);
          transform: scale(1.02);
        }
        .text-gradient {
          background: linear-gradient(135deg, #10b981 0%, #a855f7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
      `}</style>
    </div>
  );
};

export default LandingPage;