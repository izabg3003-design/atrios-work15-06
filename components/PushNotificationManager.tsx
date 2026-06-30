import React, { useState, useEffect } from 'react';
import { Bell, BellRing, Download, Smartphone, X, ShieldAlert, CheckCircle2, Sparkles, Megaphone } from 'lucide-react';
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { messaging, getToken, isFirebaseConfigured, isPushSupported, onMessage } from '../lib/firebase';

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
  const isMaster = user.email?.toLowerCase()?.includes('master@atrioswork.com') || 
                   user.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || 
                   user.email?.toLowerCase()?.includes('master@digitalnexus.com');
  const isAdmin = user.role === 'admin' || user.email === 'admin@atrioswork.com' || isMaster;

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isReadyToInstall, setIsReadyToInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [newPushAlert, setNewPushAlert] = useState<{ id: string; title: string; subtitle: string } | null>(null);
  const [customVapidKey, setCustomVapidKey] = useState<string>('');
  
  // 1. Detectar suporte a PWA e evento de instalação
  useEffect(() => {
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
        setTimeout(() => setShowInstallBanner(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsReadyToInstall(false);
      setShowInstallBanner(false);
      triggerNativePush('AtriosWork Instalado!', 'Obrigado por instalar o aplicativo. Agora já pode registar horas diretamente do seu ecrã inicial.');
    });

    // Diagnosticar permissão de notificações atual
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default' && user.id) {
        // Mostrar sugestão de push após 5 segundos logado
        setTimeout(() => setShowPermissionBanner(true), 5000);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [user.id]);

  // 2. Poll/Escutar por Novas Notificações (Broadcasts do Admin no app_banners com tipo push)
  useEffect(() => {
    if (!user.id) return;

    // Função de verificação
    const checkBroadcastNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('app_banners')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          // Filtrar por banners marcados como push ou com tag "[PUSH]" no título
          const pushes = data.filter(b => {
            const isPush = b.user_type === 'push_notification' || 
                           b.title.toUpperCase().includes('[PUSH]') || 
                           b.highlight?.toUpperCase()?.includes('[PUSH]');
            
            if (!isPush) return false;

            // Notificações administrativas de sistema (chat de visitante, suporte solicitado, vendas, cadastros, etc.) devem ser visíveis APENAS para admins/master.
            // No entanto, as respostas de suporte enviadas para o próprio utilizador (ex: "💬 Suporte AtriosWork") devem ser visíveis para utilizadores comuns!
            const titleUpper = b.title.toUpperCase();
            const subtitleUpper = (b.subtitle || "").toUpperCase();
            const highlightUpper = (b.highlight || "").toUpperCase();

            const isSupportReply = titleUpper.includes('ATRIOSWORK') || 
                                   titleUpper.includes('RESPOSTA') ||
                                   titleUpper.includes('💬 RESPOSTA');

            const isSupportChatOrAdminSystem = 
              !isSupportReply && (
                titleUpper.includes('💬 SUPORTE') || 
                titleUpper.includes('🆘 SUPORTE') || 
                titleUpper.includes('💬 VISITANTE') || 
                titleUpper.includes('SUPORTE HUMANO') ||
                titleUpper.includes('NOVO CADASTRO') || 
                titleUpper.includes('NOVA VENDA') || 
                titleUpper.includes('ATENDIMENTO') ||
                subtitleUpper.includes('SUPORTE HUMANO') ||
                subtitleUpper.includes('VISITANTE') ||
                subtitleUpper.includes('SISTEMA') ||
                subtitleUpper.includes('VENDAS') ||
                subtitleUpper.includes('SUPORTE') ||
                highlightUpper.includes('SOLICITOU ATENDIMENTO') ||
                highlightUpper.includes('SUPORTE HUMANO')
              );

            if (isSupportChatOrAdminSystem && !isAdmin) {
              return false;
            }

            return true;
          });

          if (pushes.length > 0) {
            const shownPushesRaw = localStorage.getItem('shown_push_notifications') || '[]';
            const shownPushes: string[] = JSON.parse(shownPushesRaw);
            
            // Encontrar o push mais recente que ainda não foi mostrado
            const freshPush = pushes.find(p => !shownPushes.includes(p.id));
            
            if (freshPush) {
              const cleanTitle = freshPush.title.replace('[PUSH]', '').replace('[push]', '').trim();
              const cleanBody = `${freshPush.highlight || ''} ${freshPush.subtitle || ''}`.trim();
              
              // 1. Mostrar Notificação Nativa Push (Apenas como fallback se FCM não estiver ativo no dispositivo)
              const hasFCMActive = isFirebaseConfigured && isPushSupported() && notificationPermission === 'granted';
              if (!hasFCMActive) {
                triggerNativePush(cleanTitle, cleanBody);
              }
              
              // 2. Mostrar Alerta Visual no App
              setNewPushAlert({
                id: freshPush.id,
                title: cleanTitle,
                subtitle: cleanBody
              });

              // 3. Registar como mostrado
              shownPushes.push(freshPush.id);
              localStorage.setItem('shown_push_notifications', JSON.stringify(shownPushes));
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar push do servidor:', err);
      }
    };

    // Verificar imediatamente e depois a cada 30 segundos
    checkBroadcastNotifications();
    const interval = setInterval(checkBroadcastNotifications, 30000);
    return () => clearInterval(interval);
  }, [user.id, notificationPermission]);

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
  const triggerNativePush = (title: string, body: string) => {
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
            tag: 'atrioswork-alert'
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

  // Helper para converter a chave pública VAPID recebida do backend
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Função unificada para registar ambos os sistemas de push de forma robusta e sem conflitos
  const registerUnifiedPush = async () => {
    if (!user.id) return;

    let fcmToken: string | null = null;
    let vapidSub: any = null;

    // 1. Tentar obter o token FCM se suportado
    if (isFirebaseConfigured && isPushSupported() && messaging) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = customVapidKey || (import.meta as any).env.VITE_FIREBASE_VAPID_KEY;
        fcmToken = await getToken(messaging, {
          serviceWorkerRegistration: reg,
          vapidKey: vapidKey || undefined
        });
        if (fcmToken) {
          console.log('[Push Manager] Token FCM obtido com sucesso:', fcmToken);
        }
      } catch (fcmErr) {
        console.warn('[Push Manager] Erro ao obter token FCM:', fcmErr);
      }
    }

    // 2. Tentar obter a subscrição VAPID Web Push
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        let subscription = await reg.pushManager.getSubscription();

        if (!subscription) {
          const res = await fetch('/api/push/public-key');
          const { publicKey } = await res.json();

          if (publicKey) {
            const convertedKey = urlBase64ToUint8Array(publicKey);
            subscription = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey
            });
          }
        }

        if (subscription) {
          vapidSub = subscription.toJSON();
          console.log('[Push Manager] Subscrição VAPID obtida com sucesso:', vapidSub);
        }
      } catch (vapidErr) {
        console.warn('[Push Manager] Erro ao obter subscrição VAPID:', vapidErr);
      }
    }

    // 3. Persistir os dados unificados no Supabase e no Backend Local
    try {
      let combinedPayload: any = null;

      if (vapidSub) {
        // Se temos VAPID, ele é a estrutura principal de JSON
        combinedPayload = {
          ...vapidSub,
          fcmToken: fcmToken || undefined
        };
      } else if (fcmToken) {
        // Se só temos FCM, guardamos como string normal
        combinedPayload = fcmToken;
      }

      if (combinedPayload) {
        const tokenString = typeof combinedPayload === 'object' ? JSON.stringify(combinedPayload) : combinedPayload;
        
        // A) Salvar no perfil do usuário no Supabase (coluna fcm_token contendo o payload unificado)
        const { error } = await supabase
          .from('profiles')
          .update({ fcm_token: tokenString })
          .eq('id', user.id);

        if (error) {
          console.error('[Push Manager] Erro ao sincronizar token unificado no Supabase:', error);
        } else {
          console.log('[Push Manager] Token unificado sincronizado com sucesso no Supabase!');
        }

        // B) Se for VAPID, também registrar no backend local para fins de cache de arquivo local / Firestore
        if (vapidSub) {
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription: combinedPayload,
              userId: user.id,
              email: user.email || undefined,
              role: user.role || undefined
            })
          });
        }
      }
    } catch (saveErr) {
      console.error('[Push Manager] Erro fatal ao tentar persistir tokens:', saveErr);
    }
  };

  // 0. Carregar e aplicar configuração customizada do Firebase FCM se houver na tabela app_banners
  useEffect(() => {
    if (!user.id) return;
    
    const applyCustomFcmConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('app_banners')
          .select('*')
          .eq('user_type', 'fcm_config')
          .maybeSingle();

        if (!error && data && data.highlight) {
          try {
            const customConfig = JSON.parse(data.highlight);
            if (customConfig && customConfig.apiKey && customConfig.projectId) {
              console.log('Detectada configuração customizada do Firebase:', customConfig.projectId);
              if (customConfig.vapidKey) {
                setCustomVapidKey(customConfig.vapidKey);
              }
              const { reinitializeFirebase } = await import('../lib/firebase');
              const newMessaging = reinitializeFirebase(customConfig);
              if (newMessaging) {
                // Forçar registo do token com o novo projeto
                setTimeout(() => {
                  registerUnifiedPush();
                }, 1500);
              }
            }
          } catch (jsonErr) {
            console.error('Erro ao parsear JSON de configuração customizada:', jsonErr);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar configuração customizada do Firebase:', err);
      }
    };

    applyCustomFcmConfig();
  }, [user.id]);

  // Efeito para registrar o token e assinatura unificados automaticamente se a permissão já estiver concedida
  useEffect(() => {
    if (user.id && notificationPermission === 'granted') {
      registerUnifiedPush();
    }
  }, [user.id, notificationPermission]);

  // Efeito para escutar mensagens em primeiro plano (foreground)
  useEffect(() => {
    if (!messaging || !user.id) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Mensagem FCM em primeiro plano recebida:', payload);
      const title = payload.notification?.title || 'Mensagem';
      const body = payload.notification?.body || '';

      // O Service Worker (sw-v3.js) já exibe a notificação de sistema nativa automaticamente
      // ao escutar o evento 'push'. Em primeiro plano, evitamos re-disparar a notificação
      // de sistema para não duplicar, e apenas mostramos o banner interno do app.

      // Atualizar Alerta Visual no App (banner flutuante superior)
      setNewPushAlert({
        id: payload.messageId || String(Date.now()),
        title: title,
        subtitle: body
      });
    });

    return () => unsubscribe();
  }, [user.id]);

  // Escutar inserções em tempo real no app_banners para administradores receberem alertas imediatos
  useEffect(() => {
    if (!user.id || !isAdmin) return;

    const channel = supabase
      .channel('admin-banners-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_banners'
        },
        (payload: any) => {
          const newBanner = payload.new;
          if (newBanner && (newBanner.title?.includes('[PUSH]') || newBanner.user_type === 'push_notification')) {
            const cleanTitle = newBanner.title.replace('[PUSH]', '').trim();
            const cleanBody = newBanner.highlight || '';
            
            // Exibir no pop-up flutuante do app
            setNewPushAlert({
              id: String(newBanner.id || Date.now()),
              title: cleanTitle,
              subtitle: cleanBody
            });

            // Disparar notificação do browser nativa se a permissão estiver concedida
            triggerNativePush(cleanTitle, cleanBody);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id, isAdmin]);

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
        if (user.id) {
          registerUnifiedPush();
        }
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
      {/* 1. Banner para Instalar PWA (Baixar Aplicativo) */}
      {showInstallBanner && isReadyToInstall && (
        <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-10 z-[2900] max-w-sm w-full bg-slate-900/95 backdrop-blur-xl border border-emerald-500/30 p-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(16,185,129,0.2)] animate-[slideUp_0.5s_ease-out] flex flex-col gap-4">
          <button 
            onClick={dismissInstallPrompt}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-500/30 text-emerald-400">
              <Download className="w-6 h-6 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                Baixar Aplicativo <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              </h4>
              <p className="text-[10px] text-slate-400 leading-normal font-bold uppercase">
                Instale o AtriosWork no seu ecrã inicial para acesso rápido aos registos e uso offline completo.
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={dismissInstallPrompt}
              className="flex-1 py-3 bg-slate-950 text-slate-400 hover:text-white font-black text-[9px] uppercase tracking-wider rounded-2xl transition-all border border-slate-800"
            >
              Agora Não
            </button>
            <button
              onClick={installApp}
              className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[9px] uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-500/10 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Smartphone className="w-3.5 h-3.5" /> Descarregar App
            </button>
          </div>
        </div>
      )}

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
