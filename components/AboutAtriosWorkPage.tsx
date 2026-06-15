
import React from 'react';
import { ShieldCheck, Cpu, Globe, Rocket, Zap, Clock, Users, Award, ArrowLeft, Star, Heart, Fingerprint, Code2, Binary, Gem, Landmark } from 'lucide-react';

interface Props {
  onBack: () => void;
}

const AboutAtriosWorkPage: React.FC<Props> = ({ onBack }) => {
  return (
    <div className="space-y-16 animate-[fadeIn_0.5s_ease-out] pb-40">
      {/* Header com Navegação */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Binary className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Corporate Intelligence Hub</span>
          </div>
          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">ATRIOSWORK<span className="text-emerald-400">_MANIFESTO</span></h2>
        </div>
        <button onClick={onBack} className="flex items-center gap-3 text-slate-500 hover:text-emerald-400 transition-all group px-6 py-3 bg-slate-900/40 border border-white/5 rounded-2xl">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-2 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest">Regressar ao Ecossistema</span>
        </button>
      </div>

      {/* Hero Section Imersiva */}
      <div className="relative glass p-10 md:p-20 rounded-[4rem] border-emerald-500/20 bg-emerald-500/[0.02] overflow-hidden group">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-600/10 rounded-full blur-[120px] group-hover:bg-emerald-600/20 transition-all duration-700"></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]"></div>
        
        <div className="relative z-10 max-w-3xl space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">Digital Sentinel Protocol v4.0</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[0.85]">
            O TEMPO É <br/><span className="text-emerald-400">LÍQUIDO.</span><br/>NÓS SOMOS O CANAL.
          </h1>
          
          <div className="space-y-6 text-slate-400 text-lg md:text-xl font-medium leading-relaxed italic border-l-2 border-emerald-500/30 pl-8">
            <p>
              "A AtriosWork não nasceu em uma sala de reuniões convencional. Ela emergiu da frustração de observar profissionais de elite — arquitetos, engenheiros, consultores e freelancers — perderem até 15% do seu faturamento anual por uma falha invisível: a imprecisão do tempo."
            </p>
            <p className="text-base font-normal not-italic text-slate-500">
              Percebemos que o mercado estava saturado de cronómetros simples, mas carecia de uma **Sentinela Fiscal**. Alguém precisava de construir a ponte entre o esforço humano e o lucro atómico. Nós construímos essa ponte.
            </p>
          </div>
        </div>
      </div>

      {/* Aprofundamento: A História e a Engenharia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <div className="space-y-4">
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tight flex items-center gap-3">
              <Code2 className="w-6 h-6 text-purple-400" /> A Gênese do AtriosWork
            </h3>
            <div className="space-y-4 text-slate-400 text-sm leading-relaxed">
              <p>
                Em 2024, identificamos um padrão alarmante no ecossistema de trabalho remoto e presencial em Portugal e na Europa. A complexidade dos impostos (IRS, SS, IVA) combinada com horários flexíveis estava a criar um "caos silencioso". O profissional trabalhava mais, mas via menos lucro no final do mês devido a arredondamentos errados e distrações administrativas.
              </p>
              <p>
                A nossa resposta foi desenvolver o **AtriosWork**. Não é apenas um app de horas; é uma infraestrutura de inteligência financeira. Cada linha de código foi escrita com um único objetivo: garantir que nem um único segundo de trabalho seja doado por falta de registo.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tight flex items-center gap-3">
              <Gem className="w-6 h-6 text-emerald-400" /> O Padrão AtriosWork
            </h3>
            <div className="space-y-4 text-slate-400 text-sm leading-relaxed">
              <p>
                Para nós, "bom o suficiente" nunca foi uma opção. Implementamos protocolos de segurança de nível bancário e uma interface que remove a fricção. Acreditamos que o software deve ser invisível e o resultado deve ser tangível.
              </p>
              <p>
                Hoje, a AtriosWork é sinônimo de **Soberania Temporal**. Permitimos que tu te foques na tua arte, enquanto nós tratamos da matemática, da conformidade e da proteção do teu legado financeiro.
              </p>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/20 to-emerald-600/20 rounded-[3.5rem] blur-2xl group-hover:scale-105 transition-transform duration-700"></div>
          <div className="relative glass p-12 rounded-[3.5rem] border-white/5 space-y-8">
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-emerald-500/30 flex items-center justify-center shadow-2xl">
              <Landmark className="w-8 h-8 text-emerald-400" />
            </div>
            <h4 className="text-xl font-black text-white uppercase italic">Filosofia de Operação</h4>
            <ul className="space-y-6">
              {[
                { t: "Precisão Atómica", d: "Não trabalhamos com estimativas. Trabalhamos com factos matemáticos." },
                { t: "Privacidade Absoluta", d: "Os teus dados são a tua propriedade. Nós apenas os blindamos." },
                { t: "Crescimento Exponencial", d: "Ferramentas que evoluem conforme o teu sucesso financeiro aumenta." }
              ].map((item, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-widest mb-1">{item.t}</p>
                    <p className="text-[11px] text-slate-500 font-medium uppercase">{item.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Grid de Pilares Técnicos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: ShieldCheck, title: "Blindagem de Dados", desc: "Segurança de nível bancário com encriptação AtriosWork-Cloud de 256 bits.", color: "emerald" },
          { icon: Cpu, title: "Inteligência Atómica", desc: "Algoritmos proprietários que processam impostos complexos em microssegundos.", color: "purple" },
          { icon: Rocket, title: "Escalabilidade", desc: "Arquitetura projetada para suportar desde o freelancer solo até multinacionais.", color: "blue" },
          { icon: Zap, title: "Performance Elite", desc: "Interface otimizada para latência zero, garantindo foco total no trabalho.", color: "amber" }
        ].map((pilar, i) => (
          <div key={i} className="glass p-8 rounded-[2.5rem] border-white/5 hover:border-white/20 transition-all group">
            <div className={`w-12 h-12 rounded-2xl bg-${pilar.color}-500/10 flex items-center justify-center mb-6 border border-${pilar.color}-500/20 group-hover:scale-110 transition-transform`}>
              <pilar.icon className={`w-6 h-6 text-${pilar.color}-400`} />
            </div>
            <h4 className="text-sm font-black text-white uppercase tracking-widest mb-3 italic">{pilar.title}</h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed uppercase tracking-tighter opacity-80">{pilar.desc}</p>
          </div>
        ))}
      </div>

      {/* Seção Estatísticas de Impacto */}
      <div className="glass p-12 rounded-[3.5rem] border-white/5 relative overflow-hidden text-center space-y-12">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-600/[0.02] to-transparent"></div>
        
        <div className="space-y-4 relative z-10">
          <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.5em]">Global Reach Statistics</h3>
          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">Impacto <span className="text-emerald-400">AtriosWork</span></h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
          <div>
            <p className="text-5xl font-black text-white tracking-tighter mb-2 italic">1.2M+</p>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Horas Monitorizadas</p>
          </div>
          <div>
            <p className="text-5xl font-black text-emerald-400 tracking-tighter mb-2 italic">99.9%</p>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Precisão Fiscal</p>
          </div>
          <div>
            <p className="text-5xl font-black text-white tracking-tighter mb-2 italic">15k+</p>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Utilizadores Elite</p>
          </div>
        </div>
      </div>

      {/* Manifesto Final */}
      <div className="max-w-3xl mx-auto text-center space-y-10">
        <Star className="w-12 h-12 text-emerald-400 mx-auto animate-pulse" />
        <div className="space-y-6">
          <h3 className="text-3xl md:text-4xl font-black text-white uppercase italic tracking-tighter leading-tight">
            "Na AtriosWork, não criamos apenas ferramentas.<br/>Nós construímos a infraestrutura da tua <span className="text-emerald-400">liberdade</span>."
          </h3>
          <p className="text-slate-500 text-sm max-w-xl mx-auto leading-relaxed font-medium">
            Seja bem-vindo a uma nova era de gestão. Onde o tempo não é algo que se perde, mas algo que se domina com elegância e tecnologia.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center font-black text-white text-[10px] shadow-2xl border border-white/5">AW</div>
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em]">Infraestrutura de Elite • Lisboa 2026</p>
        </div>
      </div>
    </div>
  );
};

export default AboutAtriosWorkPage;
