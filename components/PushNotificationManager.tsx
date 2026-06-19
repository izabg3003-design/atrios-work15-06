import React, { useState, useEffect } from 'react';
import { Bell, BellRing, Download, Smartphone, X, ShieldAlert, CheckCircle2, Sparkles, Megaphone } from 'lucide-react';
import { UserProfile } from '../types';
import { supabase, parseDbBanner } from '../lib/supabase';

interface Props {
  user: UserProfile;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const PushNotificationManager: React.FC<Props> = ({ user }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isReadyToInstall, setIsReadyToInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [newPushAlert, setNewPushAlert] = useState<{ id: string; title: string; subtitle: string } | null>(null);
  
  // 1. Detectar suporte a PWA e evento de instalação
  useEffect(() => {
    let installBannerTimer: NodeJS.Timeout | undefined;
    let permissionBannerTimer: NodeJS.Timeout | undefined;

    // Verificar se já está a correr como PWA Standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          (window.navigator as any).standalone === true;
    
    if (isStandalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsReadyToInstall(true);
      
      // Mostrar banner de instalação se ainda não foi fechado pelo usuário nesta sessão
      const isDismissed = sessionStorage.getItem('pwa_install_dismissed') === 'true';
      if (!isDismissed && !isStandalone) {
        // Delay ligeiro para não atrapalhar o login/splash
        installBannerTimer = setTimeout(() => setShowInstallBanner(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsReadyToInstall(false);
      setShowInstallBanner(false);
      triggerNativePush('AtriosWork Instalado!', 'Obrigado por instalar o aplicativo. Agora já pode registar horas diretamente do seu ecrã inicial.');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Diagnosticar permissão de notificações atual
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default' && user.id) {
        // Mostrar sugestão de push após 5 segundos logado
        permissionBannerTimer = setTimeout(() => setShowPermissionBanner(true), 5000);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (installBannerTimer) clearTimeout(installBannerTimer);
      if (permissionBannerTimer) clearTimeout(permissionBannerTimer);
    };
  }, [user.id]);

  // Auxiliares de sincronização de configurações com o cache partilhado do Service Worker
  const saveToConfigCache = async (key: string, data: any) => {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open('atrioswork-config-v1');
      const response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      });
      await cache.put(new Request(`https://local-config/${key}`), response);
    } catch (err) {
      console.warn('Erro ao guardar config no CacheStorage:', err);
    }
  };

  const markPushAsShown = async (pushId: string, currentShown: string[]) => {
    if (!currentShown.includes(pushId)) {
      currentShown.push(pushId);
    }
    localStorage.setItem('shown_push_notifications', JSON.stringify(currentShown));
    await saveToConfigCache('shown_push_ids', currentShown);
  };

  // Guardar credenciais do Supabase e estado de subscrição ativas no CacheStorage para o Service Worker
  useEffect(() => {
    if (user.id) {
      const isPro = user.subscription ? (typeof user.subscription === 'string' ? JSON.parse(user.subscription).isActive : user.subscription.isActive) : false;
      saveToConfigCache('config', {
        supabaseUrl: 'https://zuawenhgajcciefbwear.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8',
        userId: user.id,
        isPro: !!isPro
      });

      // Sincronizar IDs já exibidos do localStorage ao montar/atualizar
      const shownPushesRaw = localStorage.getItem('shown_push_notifications') || '[]';
      try {
        const shownPushes = JSON.parse(shownPushesRaw);
        saveToConfigCache('shown_push_ids', shownPushes);
      } catch (e) {}
    }
  }, [user.id, user.subscription]);

  // Registar Periodic Background Sync no Service Worker para receber notificações mesmo com o app totalmente fechado
  useEffect(() => {
    if ('serviceWorker' in navigator && user.id) {
      navigator.serviceWorker.ready.then(async (registration) => {
        // Registar o Periodic Sync para checar em segundo plano / ecrã bloqueado
        if ('periodicSync' in registration) {
          try {
            await (registration as any).periodicSync.register('check-new-pushes', {
              minInterval: 15 * 60 * 1000, // A cada 15 minutos (mínimo exigido pelos sistemas operativos/browsers)
            });
            console.log('[AtriosWork PWA] Periodic Background Sync registado.');
          } catch (err) {
            console.warn('[AtriosWork PWA] Periodic Sync indisponível (requer app instalado na homescreen):', err);
          }
        }

        // Trigger extra de navegação por Background Sync comum
        if ('sync' in registration) {
          try {
            await (registration as any).sync.register('check-new-pushes');
          } catch (e) {}
        }
      });
    }
  }, [user.id]);

  // 2. Escuta ativa e Polling para novas notificações (Instantâneo em Tempo Real usando canais Postgres e backup de Polling a cada 15s)
  useEffect(() => {
    if (!user.id) return;

    // Função de verificação (Backup & Polling)
    const checkBroadcastNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('app_banners')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          // Filtrar por banners marcados como push ou com tag "[PUSH]" no título
          const pushes = data.map(parseDbBanner).filter(b => 
            b.user_type === 'push_notification' || 
            b.title.toUpperCase().includes('[PUSH]') || 
            b.highlight?.toUpperCase()?.includes('[PUSH]')
          );

          if (pushes.length > 0) {
            const hasStoredPushes = localStorage.getItem('shown_push_notifications') !== null;
            const shownPushesRaw = localStorage.getItem('shown_push_notifications') || '[]';
            const shownPushes: string[] = JSON.parse(shownPushesRaw);
            
            if (!hasStoredPushes) {
              // Primeira verificação histórica nesta máquina/sessão: registar histórico antigo para evitar spam de popups
              const allActiveIds = pushes.map(p => p.id);
              localStorage.setItem('shown_push_notifications', JSON.stringify(allActiveIds));
              await saveToConfigCache('shown_push_ids', allActiveIds);
              return;
            }

            // Filtrar todos os pushes frescos que ainda não foram exibidos
            const freshPushes = pushes.filter(p => !shownPushes.includes(p.id));
            
            if (freshPushes.length > 0) {
              // Inverter para mostrar em ordem cronológica (do mais antigo pro mais recente)
              const sortedFresh = [...freshPushes].reverse();
              
              for (const freshPush of sortedFresh) {
                const cleanTitle = freshPush.title.replace('[PUSH]', '').replace('[push]', '').trim();
                const cleanBody = `${freshPush.highlight || ''} ${freshPush.subtitle || ''}`.trim();
                
                // 1. Mostrar Notificação Nativa Push (com tag única baseada no ID do registro para não colapsar)
                triggerNativePush(cleanTitle, cleanBody, freshPush.id);
                
                // 2. Mostrar Alerta Visual no App (atualiza o state principal com a mais recente)
                setNewPushAlert({
                  id: freshPush.id,
                  title: cleanTitle,
                  subtitle: cleanBody
                });
                
                // 3. Registar como mostrado em ambos caches
                await markPushAsShown(freshPush.id, shownPushes);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar push do servidor:', err);
      }
    };

    // Verificar imediatamente e depois a cada 15 segundos (Backup)
    checkBroadcastNotifications();
    const interval = setInterval(checkBroadcastNotifications, 15000);

    // INSCREVER EM EVENTOS EM TEMPO REAL IMEDIATO DA TABELA APP_BANNERS (Sub-segundo)
    const channel = supabase
      .channel('public:app_banners_push_instant')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_banners' },
        async (payload) => {
          try {
            const newBanner = parseDbBanner(payload.new);
            if (newBanner && newBanner.is_active) {
              const isPush = newBanner.user_type === 'push_notification' || 
                             newBanner.title.toUpperCase().includes('[PUSH]') || 
                             newBanner.highlight?.toUpperCase()?.includes('[PUSH]');
              
              if (isPush) {
                // Verificar compatibilidade de audiência (premium vs free vs público)
                const isPro = user.subscription ? (typeof user.subscription === 'string' ? JSON.parse(user.subscription).isActive : user.subscription.isActive) : false;
                const targetType = isPro ? 'premium' : 'free';
                const isAudienceMatch = newBanner.user_type === 'all' || newBanner.user_type === targetType || newBanner.user_type === 'push_notification';
                
                if (isAudienceMatch) {
                  const shownPushesRaw = localStorage.getItem('shown_push_notifications') || '[]';
                  const shownPushes: string[] = JSON.parse(shownPushesRaw);
                  
                  if (!shownPushes.includes(newBanner.id)) {
                    const cleanTitle = newBanner.title.replace('[PUSH]', '').replace('[push]', '').trim();
                    const cleanBody = `${newBanner.highlight || ''} ${newBanner.subtitle || ''}`.trim();
                    
                    triggerNativePush(cleanTitle, cleanBody, newBanner.id);
                    setNewPushAlert({
                      id: newBanner.id,
                      title: cleanTitle,
                      subtitle: cleanBody
                    });
                    
                    await markPushAsShown(newBanner.id, shownPushes);
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Erro ao receber push em tempo real:', e);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user.id, user.subscription]);

  // 3. Verificar Expiração da Assinatura (Aviso prévio de expiração)
  useEffect(() => {
    if (!user.id || !user.subscription) return;
    
    try {
      const sub = typeof user.subscription === 'string' ? JSON.parse(user.subscription) : user.subscription;
      if (sub && sub.isActive && sub.expiryDate) {
        const expiry = new Date(sub.expiryDate);
        const today = new Date();
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Se expira nos próximos 3 dias
        if (diffDays <= 3 && diffDays > 0) {
          const warningKey = `warn_sub_expiry_${sub.id}_${diffDays}days`;
          const alreadyWarned = localStorage.getItem(warningKey) === 'true';

          if (!alreadyWarned) {
            triggerNativePush(
              '⚠️ Assinatura Prestes a Expirar!',
              `A sua assinatura AtriosWork Pro expira em ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}. Renove para evitar interrupções.`
            );
            localStorage.setItem(warningKey, 'true');
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao processar expiração para push:', e);
    }
  }, [user.id, user.subscription]);

  // Função auxiliar para disparar notificação nativa do browser em PWA
  const triggerNativePush = (title: string, body: string, notificationId?: string) => {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
      // 1. Tentar por Service Worker (Ideal para disparar no ecran em segundo plano)
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, {
            body: body,
            icon: '/logo_atualizado.jpg?v=20260314_v1',
            badge: '/logo_atualizado.jpg?v=20260314_v1',
            vibrate: [200, 100, 200],
            tag: notificationId ? `atrioswork-alert-${notificationId}` : undefined
          } as any);
        }).catch(() => {
          // Fallback para Notificação normal de janela
          new Notification(title, {
            body: body,
            icon: '/logo_atualizado.jpg?v=20260314_v1',
          });
        });
      } else {
        // Fallback direta
        new Notification(title, {
          body: body,
          icon: '/logo_atualizado.jpg?v=20260314_v1',
        });
      }
    }
  };

  // Pedir Permissão de Notificações
  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('As notificações não são suportadas por este navegador.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setShowPermissionBanner(false);
      
      if (permission === 'granted') {
        triggerNativePush(
          '🔔 Notificações Ativas!',
          'Excelente! Agora receberá alertas de assinatura, novos comunicados e atualizações das suas horas trabalhadas.'
        );
      }
    } catch (err) {
      console.error('Erro ao pedir permissão de notificações:', err);
    }
  };

  // Executar Instalação do PWA
  const installApp = async () => {
    window.dispatchEvent(new CustomEvent('open-pwa-install-modal'));
    setShowInstallBanner(false);
  };

  const dismissInstallPrompt = () => {
    sessionStorage.setItem('pwa_install_dismissed', 'true');
    setShowInstallBanner(false);
  };

  return (
    <>
      {/* 2. Banner de Autorização do Push Notification */}
      {showPermissionBanner && notificationPermission === 'default' && (
        <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-10 z-[2800] max-w-sm w-full bg-slate-900/95 backdrop-blur-xl border border-blue-500/30 p-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(59,130,246,0.2)] animate-[slideUp_0.5s_ease-out] flex flex-col gap-4">
          <button 
            onClick={() => setShowPermissionBanner(false)}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center shrink-0 border border-blue-500/30 text-blue-400">
              <BellRing className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-black text-white uppercase tracking-widest">
                Alertas Activos
              </h4>
              <p className="text-[10px] text-slate-400 leading-normal font-bold uppercase">
                Ative as notificações push para ser avisado sobre expiração de assinatura, aprovações, e relatórios mensais.
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setShowPermissionBanner(false)}
              className="flex-1 py-3 bg-slate-950 text-slate-400 hover:text-white font-black text-[9px] uppercase tracking-wider rounded-2xl transition-all border border-slate-800"
            >
              Ignorar
            </button>
            <button
              onClick={requestPermission}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-[9px] uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-500/10 hover:scale-[1.02] active:scale-95 transition-all"
            >
              Autorizar Push
            </button>
          </div>
        </div>
      )}

      {/* 3. Popup Visual de Nova Notificação para o Usuário Logado */}
      {newPushAlert && (
        <div className="fixed top-10 left-4 right-4 md:left-auto md:right-10 z-[5000] max-w-sm w-full bg-slate-950 border-2 border-amber-500/40 p-6 rounded-[2.5rem] shadow-[0_0_50px_rgba(245,158,11,0.15)] animate-[slideDown_0.6s_cubic-bezier(0.16,1,0.3,1)]">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-amber-500/20 rounded-2xl flex items-center justify-center shrink-0 border border-amber-500/30 text-amber-400">
              <Megaphone className="w-5 h-5 animate-bounce" />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <h5 className="text-[10px] uppercase tracking-[0.2em] font-black text-amber-400">Notificação AtriosWork</h5>
              <h4 className="text-xs font-black text-white truncate uppercase tracking-widest">{newPushAlert.title}</h4>
              <p className="text-[10px] font-medium text-slate-400 leading-normal">{newPushAlert.subtitle}</p>
            </div>
            <button 
              onClick={() => setNewPushAlert(null)}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex justify-end">
            <button 
              onClick={() => setNewPushAlert(null)}
              className="px-4 py-1.5 bg-slate-900 border border-white/5 rounded-xl text-[8px] font-black uppercase text-slate-300 tracking-wider hover:text-white"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PushNotificationManager;
