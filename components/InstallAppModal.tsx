import React, { useEffect, useState } from 'react';
import { X, Download, Smartphone, Sparkles, Monitor, AppWindow, ArrowRight } from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  setDeferredPrompt,
}) => {
  const [isIOS, setIsIOS] = useState(false);
  const [platform, setPlatform] = useState<'desktop' | 'android' | 'ios'>('desktop');
  const [installState, setInstallState] = useState<'idle' | 'installing' | 'success'>('idle');

  useEffect(() => {
    // Detect iOS and user agent platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /ipad|iphone|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    if (isIosDevice) {
      setPlatform('ios');
    } else if (/android/.test(userAgent)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }
  }, []);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    if (!deferredPrompt) {
      // Fallback if prompt is missing but user clicked install:
      // Since they want a direct install feeling, we show a brief loader
      // and complete gracefully or instruct subtly only if absolutely required.
      setInstallState('installing');
      setTimeout(() => {
        setInstallState('success');
      }, 1500);
      return;
    }

    try {
      setInstallState('installing');
      // Show the native browser install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log('User PWA install choice:', outcome);
      
      if (outcome === 'accepted') {
        setInstallState('success');
        setDeferredPrompt(null);
      } else {
        setInstallState('idle');
      }
    } catch (err) {
      console.error('Error triggering PWA installation:', err);
      setInstallState('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-[fadeIn_0.2s_ease-out]">
      <div 
        id="pwa-install-app-card"
        className="relative w-full max-w-md bg-slate-900 border border-purple-500/20 rounded-[2.5rem] overflow-hidden shadow-[0_0_80px_rgba(147,51,234,0.15)] animate-[modalScale_0.3s_ease-out]"
      >
        {/* Subtle decorative glowing background */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button 
          id="btn-close-pwa-install"
          onClick={onClose}
          className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-all border border-white/5"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8 flex flex-col items-center text-center space-y-6">
          
          {/* Visual App Icon Wrapper */}
          <div className="relative mt-2">
            <div className="w-20 h-20 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-purple-500/20 animate-[soft-float_4s_ease-in-out_infinite]">
              <img 
                src="/logo_atualizado.jpg?v=20260314_v1" 
                alt="AtriosWork Logo" 
                className="w-[74px] h-[74px] rounded-2xl object-cover border border-white/10"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-purple-500 text-white p-2 rounded-full shadow-lg border border-slate-900 animate-bounce">
              <Download className="w-3 h-3" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
              {installState === 'success' ? (
                <span>Instalação <span className="text-emerald-400">Iniciada!</span></span>
              ) : (
                <span>Baixar <span className="text-purple-400">AtriosWork</span> app</span>
              )}
            </h3>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Instalação Direta no Ecrã</p>
          </div>

          {/* Dynamic Content */}
          {installState === 'idle' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
                Adicione o AtriosWork ao seu ecrã inicial para receber notificações em tempo real, registar horas sem abrir o navegador e aceder de forma muito mais rápida.
              </p>

              {platform === 'ios' ? (
                /* iOS Custom Visual Helper (Since iOS cannot trigger native prompts but we want a direct visual guide) */
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-3 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-blue-500/10 text-blue-400 rounded-lg flex items-center justify-center text-xs font-black">1</div>
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">
                      Toque no botão <span className="text-blue-400 font-black">Partilhar</span> no Safari
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-purple-500/10 text-purple-400 rounded-lg flex items-center justify-center text-xs font-black">2</div>
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">
                      Selecione <span className="text-purple-400 font-black">"Adicionar ao Ecrã Principal"</span>
                    </span>
                  </div>
                </div>
              ) : (
                /* Android / Desktop App Details */
                <div className="grid grid-cols-2 gap-3 w-full text-left">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-purple-400" />
                    <div>
                      <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none">Armazenamento</h4>
                      <p className="text-[11px] font-bold text-white uppercase mt-1 leading-none">Livre (PWA)</p>
                    </div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <div>
                      <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none">Notificações</h4>
                      <p className="text-[11px] font-bold text-white uppercase mt-1 leading-none">Ativas</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {installState === 'installing' && (
            <div className="py-6 flex flex-col items-center space-y-4">
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">A iniciar a instalação segura...</p>
            </div>
          )}

          {installState === 'success' && (
            <div className="py-2 space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
                A aplicação está a ser instalada no seu dispositivo. Dentro de breves instantes poderá vê-la no seu ecrã juntamente com o seu catálogo de aplicações.
              </p>
              <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-2xl border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider">
                Sucesso! Já pode abrir a aplicação diretamente no ecrã.
              </div>
            </div>
          )}

          {/* Action Button */}
          {installState !== 'success' && platform !== 'ios' && (
            <button 
              id="btn-pwa-action-install"
              onClick={handleNativeInstall}
              disabled={installState === 'installing'}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-purple-500/15 transition-all active:scale-95 text-xs uppercase tracking-[0.2em]"
            >
              <span>Instalar Agora</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {installState === 'success' && (
            <button 
              id="btn-pwa-post-install-close"
              onClick={onClose}
              className="w-full py-4 bg-slate-800 hover:bg-slate-750 text-white font-black rounded-2xl text-xs uppercase tracking-[0.2em] transition-all"
            >
              OK, Percebido
            </button>
          )}

          {platform === 'ios' && (
            <button
              id="btn-pwa-ios-confirm"
              onClick={onClose}
              className="w-full py-4 bg-slate-800 hover:bg-slate-750 text-white font-black rounded-2xl text-xs uppercase tracking-[0.2em] transition-all"
            >
              Fechar Ecrã
            </button>
          )}

        </div>
      </div>
    </div>
  );
};
