
import React from 'react';
import { ArrowLeft, ShieldCheck, Eye, Database, Lock, UserCheck } from 'lucide-react';

interface Props {
  onBack: () => void;
}

const PrivacyPage: React.FC<Props> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 p-6 md:p-12 selection:bg-emerald-500/30">
      <div className="max-w-4xl mx-auto space-y-12 animate-[fadeIn_0.5s_ease-out]">
        <button onClick={onBack} className="flex items-center gap-3 text-slate-500 hover:text-emerald-400 transition-all group">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-2" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Voltar</span>
        </button>

        <header className="space-y-4">
          <div className="flex items-center gap-3 text-emerald-400">
            <ShieldCheck className="w-8 h-8" />
            <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase text-white">Privacidade <span className="text-emerald-400">AtriosWork</span></h1>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">AtriosWork • Conformidade RGPD</p>
        </header>

        <div className="glass p-8 md:p-12 rounded-[3rem] border-white/5 space-y-10 leading-relaxed text-sm">
          <section className="space-y-4">
            <h2 className="text-white font-black uppercase flex items-center gap-3 italic"><Eye className="w-5 h-5 text-emerald-500" /> 1. Recolha de Dados</h2>
            <p>A AtriosWork recolhe dados estritamente necessários para a prestação do serviço AtriosWork: Nome, E-mail, NIF, dados de geolocalização (quando autorizado) e registos de jornada laboral. Estes dados são processados para garantir a precisão dos seus relatórios financeiros.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-white font-black uppercase flex items-center gap-3 italic"><Database className="w-5 h-5 text-emerald-500" /> 2. Armazenamento e Segurança</h2>
            <p>Todos os dados são encriptados e armazenados na nossa infraestrutura AtriosWork Cloud (via Supabase), utilizando padrões de segurança de nível bancário. O acesso é restrito apenas ao utilizador titular da conta e, em casos de suporte técnico, a agentes devidamente autorizados sob sigilo profissional.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-white font-black uppercase flex items-center gap-3 italic"><Lock className="w-5 h-5 text-emerald-500" /> 3. Direitos do Utilizador (RGPD)</h2>
            <p>Em conformidade com o Regulamento Geral sobre a Proteção de Dados em Portugal, o utilizador tem o direito de:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400 font-medium">
              <li>Aceder à totalidade dos seus dados armazenados.</li>
              <li>Solicitar a retificação imediata de informações incorretas.</li>
              <li>Solicitar o "Esquecimento Digital" (Eliminação total da conta e dados).</li>
              <li>Exportar os dados num formato estruturado (Portabilidade).</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-white font-black uppercase flex items-center gap-3 italic"><UserCheck className="w-5 h-5 text-emerald-500" /> 4. Partilha com Terceiros</h2>
            <p>A AtriosWork **não comercializa** dados pessoais. A partilha de informações apenas ocorre com autoridades fiscais (quando solicitado pelo utilizador via relatórios) ou por imperativo legal vigente na jurisdição portuguesa.</p>
          </section>

          <div className="pt-8 border-t border-white/10 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Última Atualização: Janeiro de 2026 • Lisboa, Portugal</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
