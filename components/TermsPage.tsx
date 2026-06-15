
import React from 'react';
import { ArrowLeft, Scale, CreditCard, AlertCircle, Zap, ShieldAlert } from 'lucide-react';

interface Props {
  onBack: () => void;
}

const TermsPage: React.FC<Props> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 p-6 md:p-12 selection:bg-purple-500/30">
      <div className="max-w-4xl mx-auto space-y-12 animate-[fadeIn_0.5s_ease-out]">
        <button onClick={onBack} className="flex items-center gap-3 text-slate-500 hover:text-purple-400 transition-all group">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-2" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Voltar</span>
        </button>

        <header className="space-y-4">
          <div className="flex items-center gap-3 text-purple-400">
            <Scale className="w-8 h-8" />
            <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase text-white">Termos de <span className="text-purple-400">Uso</span></h1>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">AtriosWork • Condições Contratuais</p>
        </header>

        <div className="glass p-8 md:p-12 rounded-[3rem] border-white/5 space-y-10 leading-relaxed text-sm">
          <section className="space-y-4">
            <h2 className="text-white font-black uppercase flex items-center gap-3 italic"><Zap className="w-5 h-5 text-purple-500" /> 1. Licença de Utilização</h2>
            <p>Ao ativar uma licença AtriosWork, a AtriosWork concede ao utilizador uma licença limitada, pessoal e não transferível para acesso à plataforma. O uso indevido para engenharia reversa ou exportação ilegal de código resultará na rescisão imediata e ações legais.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-white font-black uppercase flex items-center gap-3 italic"><CreditCard className="w-5 h-5 text-purple-500" /> 2. Política de Reembolso e Resolução</h2>
            <div className="bg-purple-500/10 border border-purple-500/20 p-6 rounded-2xl space-y-3">
              <p className="font-bold text-white uppercase text-xs">Direito de Livre Resolução (Decreto-Lei n.º 24/2014):</p>
              <p>Em conformidade com a legislação portuguesa para contratos celebrados à distância, o utilizador dispõe de um prazo de **14 (catorze) dias** para solicitar o cancelamento e reembolso total da sua subscrição, sem necessidade de justificação.</p>
              <p className="text-xs text-slate-400 italic">Nota: Após este período, a licença é considerada usufruída, não havendo lugar a reembolsos parciais por tempo não utilizado.</p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-white font-black uppercase flex items-center gap-3 italic"><ShieldAlert className="w-5 h-5 text-purple-500" /> 3. Limitação de Responsabilidade</h2>
            <p>O AtriosWork é uma ferramenta de apoio à gestão. A AtriosWork **não se responsabiliza** por erros no preenchimento de impostos perante a Autoridade Tributária ou perdas financeiras decorrentes de má utilização dos dados introduzidos pelo utilizador. Recomendamos sempre a validação final por um Contabilista Certificado.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-white font-black uppercase flex items-center gap-3 italic"><AlertCircle className="w-5 h-5 text-purple-500" /> 4. Jurisdição</h2>
            <p>Este contrato rege-se pela lei portuguesa. Para a resolução de qualquer litígio emergente deste contrato, as partes elegem o foro da Comarca de Lisboa, com renúncia expressa a qualquer outro.</p>
          </section>

          <div className="pt-8 border-t border-white/10 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">AtriosWork — Compliance Legal Portugal</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
