
import React from 'react';
import { Settings, LogOut, FileText, LayoutDashboard, DollarSign, ShieldCheck, BriefcaseBusiness, Award, ShoppingCart, LifeBuoy, Info, Eye, EyeOff, Lock, Briefcase } from 'lucide-react';
import { UserProfile, AppState } from '../types';

interface Props {
  activeTab: AppState;
  setActiveTab: (tab: AppState) => void;
  user: UserProfile;
  onLogout: () => void;
  t: (key: string) => any;
  hideValues: boolean;
  togglePrivacy: () => void;
  isPro?: boolean;
}

const Sidebar: React.FC<Props> = ({ activeTab, setActiveTab, user, onLogout, t, hideValues, togglePrivacy, isPro }) => {
  const isMaster = user.email?.toLowerCase()?.includes('master@atrioswork.com') || user.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || user.email?.toLowerCase()?.includes('master@digitalnexus.com') || user.email?.toLowerCase()?.includes('jefersongoes36@gmail.com');
  const isVendor = user.role === 'vendor';
  const isSupport = user.role === 'support';
  const isAdmin = user.role === 'admin' || user.email === 'admin@atrioswork.com' || isMaster;
  
  const tabs = [
    { id: 'dashboard' as AppState, icon: LayoutDashboard, label: 'Registro de dia', show: !isMaster && !isVendor && !isSupport },
    { id: 'finance' as AppState, icon: DollarSign, label: 'Finanças', show: !isMaster && !isVendor && !isSupport },
    { id: 'part-time' as AppState, icon: Briefcase, label: 'Part-Time', show: !isMaster && !isVendor && !isSupport },
    { id: 'reports' as AppState, icon: FileText, label: 'Relatórios', show: !isMaster && !isVendor && !isSupport, isLocked: !isPro },
    { id: 'accountant' as AppState, icon: BriefcaseBusiness, label: 'Contabilista', show: !isMaster && !isVendor && !isSupport, isLocked: !isPro },
    
    { id: 'vendor-detail' as AppState, icon: Award, label: 'Minha Rede', show: isVendor },
    { id: 'vendor-sales' as AppState, icon: ShoppingCart, label: 'Minhas Vendas', show: isVendor },
    
    { id: 'admin' as AppState, icon: ShieldCheck, label: 'AtriosWork Master', show: isAdmin },
    { id: 'settings' as AppState, icon: Settings, label: 'Perfil', show: true },
  ];

  const filteredTabs = tabs.filter(t => t.show);

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-24 bg-slate-950 border-r border-white/5 z-[100] flex-col items-center py-6">
        <img src="/logo_atualizado.jpg?v=20260314_v1" className="w-9 h-9 object-contain rounded-xl mb-6 shadow-lg shadow-purple-500/20" alt="AtriosWork Logo" />
        <nav className="flex-1 space-y-1.5 w-full px-2">
          {filteredTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex flex-col items-center justify-center py-2 rounded-xl transition-all relative group ${activeTab === tab.id ? 'bg-white/5 text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <div className="relative">
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                {(tab as any).isLocked && (
                  <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-slate-950">
                    <Lock className="w-2 h-2 text-slate-950" />
                  </div>
                )}
              </div>
              <span className="text-[7px] font-black uppercase tracking-tighter mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-center px-1">
                {tab.label}
              </span>
              {activeTab === tab.id && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 btn-primary rounded-r-full"></div>}
            </button>
          ))}
        </nav>
        
        <div className="flex flex-col items-center gap-1.5 mb-2">
          <button 
            onClick={togglePrivacy} 
            className={`p-2.5 rounded-xl transition-all ${hideValues ? 'text-amber-500 bg-amber-500/10' : 'text-slate-700 hover:text-slate-300'}`}
            title={hideValues ? "Mostrar Valores" : "Modo Privacidade"}
          >
            {hideValues ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>

          <button onClick={onLogout} className="p-2.5 text-slate-700 hover:text-red-500 transition-colors group flex flex-col items-center rounded-xl">
            <LogOut className="w-5 h-5" />
            <span className="text-[7px] font-black uppercase mt-1 opacity-0 group-hover:opacity-100">Sair</span>
          </button>
        </div>
      </aside>

      {/* Barra de Topo Premium para Mobile (Garante clique perfeito e evita overlaps com chat widgets) */}
      <header 
        style={{ zIndex: 2147483647 }}
        className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#020617]/95 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 shadow-lg"
      >
        <div className="flex items-center gap-2.5">
          <img src="/logo_atualizado.jpg?v=20260314_v1" className="w-8 h-8 object-contain rounded-xl shadow-md shadow-purple-500/25" alt="AtriosWork Logo" />
          <div className="flex flex-col">
            <h1 className="text-xs font-black uppercase tracking-widest text-white leading-none">AtriosWork</h1>
            <span className="text-[7px] font-black uppercase tracking-wider text-slate-500 mt-0.5 max-w-[120px] truncate">{user.name || "Membro"}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Botão de Sair */}
          <button 
            onClick={onLogout} 
            className="p-2.5 text-slate-400 hover:text-red-400 active:scale-95 flex items-center gap-1 bg-white/5 border border-white/5 rounded-xl"
            title="Terminar Sessão"
          >
            <LogOut className="w-4 h-4 stroke-[2px]" />
            <span className="text-[8px] font-black uppercase tracking-wider text-red-400/80">Sair</span>
          </button>
        </div>
      </header>

      <nav 
        style={{ zIndex: 2147483647 }}
        className="md:hidden fixed bottom-0 left-0 right-0 h-24 bg-[#020617]/95 backdrop-blur-2xl flex items-center justify-around px-2 border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.6)]"
      >
        {filteredTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const isSettings = tab.id === 'settings';
          return (
            <React.Fragment key={tab.id}>
              {isSettings && (
                <button 
                  onClick={togglePrivacy}
                  className={`flex flex-col items-center gap-1.5 p-1 transition-all duration-300 flex-1 relative ${hideValues ? 'text-amber-500' : 'text-slate-500'}`}
                >
                  <div className={`transition-all duration-300 relative ${hideValues ? 'scale-110 -translate-y-1 text-amber-500' : 'opacity-60'}`}>
                    {hideValues ? <EyeOff className="w-5 h-5 stroke-[2.5px]" /> : <Eye className="w-5 h-5 stroke-[1.5px]" />}
                  </div>
                  <span className={`text-[7px] font-black uppercase tracking-widest text-center whitespace-nowrap transition-all duration-300 ${hideValues ? 'opacity-100 text-amber-500' : 'opacity-40'}`}>
                    Privac.
                  </span>
                </button>
              )}

              <button 
                onClick={() => setActiveTab(tab.id)} 
                className={`flex flex-col items-center gap-1.5 p-1 transition-all duration-300 flex-1 relative ${isActive ? 'text-purple-400' : 'text-slate-500'}`}
              >
                <div className={`transition-all duration-300 relative ${isActive ? 'scale-110 -translate-y-1' : 'opacity-60'}`}>
                  <tab.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                  {(tab as any).isLocked && (
                    <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-slate-950">
                      <Lock className="w-2 h-2 text-slate-950" />
                    </div>
                  )}
                </div>
                <span className={`text-[7px] font-black uppercase tracking-widest text-center whitespace-nowrap transition-all duration-300 ${isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-90'}`}>
                  {tab.id === 'dashboard' ? 'Log' : tab.id === 'accountant' ? 'Contas' : tab.id === 'admin' ? 'Master' : tab.id === 'part-time' ? 'Part-Time' : tab.id === 'reports' ? 'Relat.' : tab.id === 'vendor-detail' ? 'Rede' : tab.id === 'vendor-sales' ? 'Vendas' : tab.label}
                </span>
                {isActive && (
                  <div className="absolute -top-1 w-6 h-0.5 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>
    </>
  );
};

export default Sidebar;
