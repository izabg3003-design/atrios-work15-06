import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldCheck, Search, Loader2, RefreshCw, UserPlus, X, Trash2, ShieldAlert, 
  Phone, Hash, User, ShoppingCart, Mail, Settings2, Save, Euro, CheckCircle, 
  Fingerprint, BriefcaseBusiness, LifeBuoy, Eye, Clock, Lock, Tag, UserPlus2, 
  Percent, CalendarDays, Activity, Settings, Megaphone, Plus, Power, Zap,
  Image as ImageIcon, Upload, ExternalLink, Database, Copy, Award, KeySquare, 
  BarChart3, TrendingUp, Calendar, BellRing, Smartphone, Webhook, Globe, Smile
} from 'lucide-react';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';
import { supabase } from '../lib/supabase';
import { UserProfile, AppBanner } from '../types';
import { differenceInDays, parseISO, addYears } from 'date-fns';
import AdminPartnerReports from './AdminPartnerReports';
import AdminGlobalAnalytics from './AdminGlobalAnalytics';
import AdminPlatformLedger from './AdminPlatformLedger';
import SettingsPage from './SettingsPage';

interface Props {
  currentUser?: UserProfile;
  f: (val: number) => string;
  onLogout: () => void;
  onViewVendor?: (id: string) => void;
  onViewVendorSales?: (vendor: any) => void;
  t: (key: string) => any;
  onUpdateProfile: (user: UserProfile) => Promise<boolean>;
  hideValues?: boolean;
}

// Helper functions for RS256 signature and FCM push notifications client-side
function b64Url(input: string | ArrayBuffer): string {
  let binary = "";
  if (typeof input === "string") {
    binary = btoa(encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  } else {
    const bytes = new Uint8Array(input);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    binary = btoa(binary);
  }
  return binary.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binaryString = atob(b64.replace(/\s/g, ""));
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function cleanPEM(pem: string): string {
  return pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
}

async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const cleanKey = cleanPEM(privateKeyPem);
  const binaryKey = base64ToArrayBuffer(cleanKey);

  const key = await window.crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = b64Url(JSON.stringify(header));
  const encodedClaims = b64Url(JSON.stringify(claims));
  const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);

  const signature = await window.crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, dataToSign);
  const encodedSignature = b64Url(signature);

  const jwt = `${encodedHeader}.${encodedClaims}.${encodedSignature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Erro ao obter token OAuth2 do Google: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function sendClientSideFCM(projectId: string, clientEmail: string, privateKey: string, tokens: string[], title: string, body: string): Promise<{ successCount: number; errors: string[] }> {
  if (tokens.length === 0) {
    throw new Error("Nenhum token FCM registado nesta audiência.");
  }
  
  const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
  let successCount = 0;
  const errors: string[] = [];

  const sendPromises = tokens.map(async (token) => {
    try {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: token,
            notification: {
              title: title,
              body: body,
            },
            android: {
              priority: "high"
            },
            apns: {
              headers: {
                "apns-priority": "10"
              },
              payload: {
                aps: {
                  sound: "default"
                }
              }
            },
            webpush: {
              headers: {
                "Urgency": "high"
              }
            },
            data: {
              url: "/",
              click_action: "/"
            }
          }
        })
      });

      if (response.ok) {
        successCount++;
      } else {
        const result = await response.json();
        console.error(`Falha ao enviar FCM para o token ${token.substring(0, 15)}...:`, result);
        const errMsg = result?.error?.message || JSON.stringify(result);
        if (!errors.includes(errMsg)) {
          errors.push(errMsg);
        }
      }
    } catch (err: any) {
      console.error(`Erro ao enviar FCM para o token ${token.substring(0, 15)}...:`, err);
      const errMsg = err.message || String(err);
      if (!errors.includes(errMsg)) {
        errors.push(errMsg);
      }
    }
  });

  await Promise.all(sendPromises);
  return { successCount, errors };
}

const generateAtriosWorkId = () => {
  const year = new Date().getFullYear();
  const hex = Math.random().toString(16).substr(2, 4).toUpperCase();
  const serial = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `AW-${year}-${hex}-${serial}-AW`;
};

const generateVendorCode = () => {
  return 'AW-' + Math.random().toString(36).substr(2, 5).toUpperCase();
};

const AdminPage: React.FC<Props> = ({ currentUser, f, onLogout, onViewVendor, onViewVendorSales, t, onUpdateProfile, hideValues }) => {
  const isMaster = useMemo(() => {
    const email = currentUser?.email?.toLowerCase() || '';
    return email.includes('master@atrioswork.com') || email.includes('izarellebraga@gmail.com') || email.includes('master@digitalnexus.com');
  }, [currentUser]);

  const [activeSubTab, setActiveSubTab] = useState<'users' | 'vendors' | 'reports' | 'analytics' | 'support' | 'profile' | 'banners' | 'ledger' | 'notifications'>('users');

  useEffect(() => {
    if (isMaster) {
      setActiveSubTab('analytics');
    }
  }, [isMaster]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [supportStaff, setSupportStaff] = useState<UserProfile[]>([]);
  const [banners, setBanners] = useState<AppBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [promotingUser, setPromotingUser] = useState<UserProfile | null>(null);
  
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showAddBanner, setShowAddBanner] = useState(false);
  const [showSqlHelp, setShowSqlHelp] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, name: string, type: 'user' | 'vendor' | 'support' | 'banner' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    vendorCode: ''
  });

  const [newVendor, setNewVendor] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    commission: 1.50
  });

  const [editingCommissionVendor, setEditingCommissionVendor] = useState<any | null>(null);
  const [newCommRate, setNewCommRate] = useState<number>(0);
  const [newDiscRate, setNewDiscRate] = useState<number>(5);
  const [isSavingComm, setIsSavingComm] = useState(false);
  
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  const [newBanner, setNewBanner] = useState<Partial<AppBanner>>({
    title: '', highlight: '', subtitle: '', cta_text: 'Ver Oferta', theme_color: 'emerald', is_active: true, image_url: '', user_type: 'all'
  });

  const [newPushTitle, setNewPushTitle] = useState('');
  const [newPushBody, setNewPushBody] = useState('');
  const [newPushAudience, setNewPushAudience] = useState<'all' | 'free' | 'premium'>('all');
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushSendResult, setPushSendResult] = useState<{ success: boolean; msg: string } | null>(null);
  
  // Novos estados para agendamento de push
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [pushHistoryTab, setPushHistoryTab] = useState<'sent' | 'scheduled'>('sent');
  
  // Emoji picker visibility states
  const [showTitleEmojiPicker, setShowTitleEmojiPicker] = useState(false);
  const [showBodyEmojiPicker, setShowBodyEmojiPicker] = useState(false);
  
  const [fcmServiceAccount, setFcmServiceAccount] = useState<string>(() => {
    return localStorage.getItem('fcm_service_account') || '';
  });
  const [showFcmConfig, setShowFcmConfig] = useState(false);
  const [fcmClientConfig, setFcmClientConfig] = useState<string>('');
  const [isSavingClientConfig, setIsSavingClientConfig] = useState(false);

  useEffect(() => {
    const loadClientConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('app_banners')
          .select('*')
          .eq('user_type', 'fcm_config')
          .maybeSingle();
        if (!error && data) {
          setFcmClientConfig(data.highlight || '');
        }
      } catch (err) {
        console.warn('Erro ao carregar fcm_config:', err);
      }
    };
    loadClientConfig();
  }, [activeSubTab]);

  // Verificação automática e disparo em background de notificações agendadas pendentes
  useEffect(() => {
    const checkAndDispatchScheduledPushes = async () => {
      const scheduledPushes = banners.filter(b => b.user_type === 'push_scheduled');
      if (scheduledPushes.length === 0) return;

      const currentTime = new Date();
      const pendingPushes = scheduledPushes.filter(b => {
        try {
          const schedTime = new Date(b.cta_link);
          return schedTime <= currentTime;
        } catch (e) {
          return false;
        }
      });

      if (pendingPushes.length === 0) return;

      console.log(`[Scheduled Push] Detetados ${pendingPushes.length} agendamentos pendentes para disparar!`);

      for (const push of pendingPushes) {
        try {
          const title = push.title.replace('[SCHEDULED]', '').trim();
          const body = push.highlight;
          const audience = push.subtitle as 'all' | 'free' | 'premium';

          console.log(`[Scheduled Push] A disparar automaticamente: "${title}" para ${audience}`);

          let clientFcmMsg = '';
          let clientFcmSuccess = false;

          // Se tiver conta de serviço local, envia o FCM nativo
          if (fcmServiceAccount.trim()) {
            try {
              const sa = JSON.parse(fcmServiceAccount.trim());
              const projectId = sa.project_id;
              const clientEmail = sa.client_email;
              const privateKey = sa.private_key;

              if (projectId && clientEmail && privateKey) {
                const { data: allProfiles, error: profErr } = await supabase
                  .from('profiles')
                  .select('id, fcm_token, name, role')
                  .not('fcm_token', 'is', null);

                if (!profErr && allProfiles) {
                  let filteredProfiles = allProfiles || [];
                  if (audience === 'premium') {
                    filteredProfiles = filteredProfiles.filter(p => {
                      const sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
                      return sub && sub.isActive === true;
                    });
                  } else if (audience === 'free') {
                    filteredProfiles = filteredProfiles.filter(p => {
                      const sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
                      return !sub || sub.isActive !== true;
                    });
                  }

                  const validTokens = filteredProfiles
                    .map(p => p.fcm_token)
                    .filter((t): t is string => !!t && t.trim().length > 0);

                  if (validTokens.length > 0) {
                    const { successCount } = await sendClientSideFCM(
                      projectId,
                      clientEmail,
                      privateKey,
                      validTokens,
                      title,
                      body
                    );
                    if (successCount > 0) {
                      clientFcmSuccess = true;
                      clientFcmMsg = `Enviado para ${successCount} dispositivos ativos.`;
                    }
                  }
                }
              }
            } catch (fcmErr) {
              console.error("[Scheduled Push] Falha ao enviar FCM nativo:", fcmErr);
            }
          }

          // Redundância via Edge Function do Supabase
          try {
            await supabase.functions.invoke('send-fcm-push', {
              body: {
                title: title,
                body: body,
                audience: audience
              }
            });
          } catch (fcmFuncErr) {
            console.warn('[Scheduled Push] Edge Function offline:', fcmFuncErr);
          }

          // Atualizar o registro do banner na tabela 'app_banners' de volta para ativo/enviado
          const { error: updateErr } = await supabase
            .from('app_banners')
            .update({
              title: `[PUSH] ${title}`,
              user_type: audience === 'all' ? 'push_notification' : (audience === 'premium' ? 'premium' : 'free'),
              is_active: true,
              cta_link: '/',
              created_at: new Date().toISOString()
            })
            .eq('id', push.id);

          if (updateErr) throw updateErr;

        } catch (err) {
          console.error(`[Scheduled Push] Erro ao disparar push ${push.id}:`, err);
        }
      }

      // Recarregar os dados do painel para refletir o disparo
      fetchData();
    };

    // Roda a verificação a cada 10 segundos se o painel de notificações estiver aberto
    if (activeSubTab === 'notifications') {
      const interval = setInterval(checkAndDispatchScheduledPushes, 10000);
      return () => clearInterval(interval);
    }
  }, [activeSubTab, banners, fcmServiceAccount]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeSubTab === 'users') {
        const { data } = await supabase.from('profiles').select('*').neq('role', 'vendor').neq('role', 'support').not('email', 'ilike', '%master@atrioswork.com%').not('email', 'ilike', '%izarellebraga@gmail.com%').not('email', 'ilike', '%master@digitalnexus.com%');
        setUsers(data || []);
      } else if (activeSubTab === 'vendors') {
        const { data: vData } = await supabase.from('vendors').select('*');
        const { data: pData } = await supabase.from('profiles').select('*').in('id', vData?.map(v => v.id) || []);
        setVendors(vData?.map(v => ({ ...v, profile: pData?.find(p => p.id === v.id) })) || []);
      } else if (activeSubTab === 'support') {
        const { data } = await supabase.from('profiles').select('*').eq('role', 'support');
        setSupportStaff(data || []);
      } else if (activeSubTab === 'banners' || activeSubTab === 'notifications') {
        const { data, error } = await supabase.from('app_banners').select('*').order('created_at', { ascending: false });
        if (error && error.code === '42P01') {
          setBanners([]);
          setShowSqlHelp(true);
        } else {
          setBanners(data || []);
        }
        
        // Se for o painel de notificações, buscar os perfis de utilizadores para estatísticas de ecrã
        if (activeSubTab === 'notifications') {
          const { data: userData } = await supabase.from('profiles').select('id, name, email');
          if (userData) {
            setUsers(userData as any);
          }
        }
      }
    } catch (e) { 
      console.error("AtriosWork Admin Error:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { 
    if (!['profile', 'reports', 'analytics', 'ledger'].includes(activeSubTab)) fetchData(); 
  }, [activeSubTab]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;
    if (newUser.password !== newUser.confirmPassword) {
      alert("As senhas não coincidem!");
      return;
    }
    
    setIsCreating(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: { 
          data: { 
            full_name: newUser.name, 
            phone: newUser.phone
          } 
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone,
          vendor_code: newUser.vendorCode.trim().toUpperCase() || null,
          role: 'user',
          hourlyRate: 10,
          isFreelancer: false,
          subscription: {
            id: generateAtriosWorkId(),
            startDate: new Date().toISOString(), 
            isActive: true,
            status: 'ACTIVE_ADMIN_CREATED'
          }
        });

        if (profileError) throw profileError;
        
        setShowAddUser(false);
        setNewUser({ name: '', email: '', phone: '', password: '', confirmPassword: '', vendorCode: '' });
        fetchData();
      }
    } catch (e: any) {
      alert(`Erro ao criar membro: ${e.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;
    if (newVendor.password !== newVendor.confirmPassword) {
      alert("As senhas não coincidem!");
      return;
    }
    
    setIsCreating(true);
    try {
      const generatedCode = generateVendorCode();
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newVendor.email,
        password: newVendor.password,
        options: { 
          data: { 
            full_name: newVendor.name, 
            phone: newVendor.phone
          } 
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          name: newVendor.name,
          email: newVendor.email,
          phone: newVendor.phone,
          vendor_code: generatedCode,
          role: 'vendor',
          hourlyRate: 10,
          isFreelancer: false,
          subscription: {
            id: generateAtriosWorkId(),
            startDate: new Date().toISOString(), 
            isActive: true,
            status: 'VENDOR_ACTIVE'
          }
        });

        if (profileError) throw profileError;

        const { error: vendorTableError } = await supabase.from('vendors').insert({
          id: authData.user.id,
          name: newVendor.name,
          email: newVendor.email,
          code: generatedCode,
          commission_rate: newVendor.commission,
          total_sales: 0
        });

        if (vendorTableError) throw vendorTableError;
        
        setShowAddVendor(false);
        setNewVendor({ name: '', email: '', phone: '', password: '', confirmPassword: '', commission: 1.50 });
        fetchData();
      }
    } catch (e: any) {
      alert(`Erro ao criar parceiro: ${e.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleBannerImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewBanner(prev => ({ ...prev, image_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      const bannerData = {
        title: newBanner.title || 'Sem Título',
        highlight: newBanner.highlight || '',
        subtitle: newBanner.subtitle || '',
        cta_text: newBanner.cta_text || 'Saber Mais',
        cta_link: newBanner.cta_link || '',
        theme_color: newBanner.theme_color || 'emerald',
        is_active: true,
        user_type: newBanner.user_type || 'all',
        image_url: newBanner.image_url || null
      };
      
      const { error } = await supabase.from('app_banners').insert([bannerData]);
      if (error) throw error;
      
      setShowAddBanner(false);
      setNewBanner({ title: '', highlight: '', subtitle: '', cta_text: 'Ver Oferta', theme_color: 'emerald', is_active: true, image_url: '', user_type: 'all' });
      fetchData();
    } catch (e: any) { 
      const isUserTypeErr = e.message?.includes('user_type') || e.message?.includes('column') || JSON.stringify(e).includes('user_type');
      if (isUserTypeErr) {
        alert(`Erro AtriosWork: A tabela 'app_banners' não possui a coluna 'user_type' no seu Supabase.\n\nPara corrigir, aceda ao SQL Editor no painel do Supabase e execute:\n\nALTER TABLE app_banners ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'all';`);
      } else {
        alert(`Erro AtriosWork: ${e.message}`);
      }
    } finally { 
      setIsCreating(false); 
    }
  };

  const handleSendPushNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPushTitle.trim() || !newPushBody.trim()) {
      alert('Por favor, preencha o título e a mensagem para a notificação push!');
      return;
    }
    
    setIsSendingPush(true);
    setPushSendResult(null);
    try {
      if (isScheduled) {
        if (!scheduledDate || !scheduledTime) {
          alert('Por favor, selecione a data e a hora para o agendamento!');
          setIsSendingPush(false);
          return;
        }

        const scheduledDateTime = `${scheduledDate}T${scheduledTime}:00`;
        const testDate = new Date(scheduledDateTime);
        if (isNaN(testDate.getTime())) {
          throw new Error("A data ou hora inserida é inválida.");
        }

        if (testDate <= new Date()) {
          alert("A data e hora do agendamento têm de ser no futuro!");
          setIsSendingPush(false);
          return;
        }

        const pushRecord = {
          title: `[SCHEDULED] ${newPushTitle.trim()}`,
          highlight: newPushBody.trim(),
          subtitle: newPushAudience, // Guardamos a audiência original para ser disparada
          cta_text: 'Abrir App',
          cta_link: testDate.toISOString(), // Guardamos o timestamp ISO no cta_link
          theme_color: 'amber',
          is_active: false, // Inativo por padrão para não aparecer para os usuários antes do tempo
          user_type: 'push_scheduled',
          image_url: null
        };

        const { error } = await supabase.from('app_banners').insert([pushRecord]);
        if (error) throw error;

        setNewPushTitle('');
        setNewPushBody('');
        setIsScheduled(false);
        setPushSendResult({
          success: true,
          msg: `Notificação agendada com sucesso para ${testDate.toLocaleDateString('pt-PT')} às ${testDate.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}!`
        });
        fetchData();
        setIsSendingPush(false);
        return;
      }

      // Marcamos o banner como [PUSH] no título ou colocamos o tipo 'push_notification'
      const pushRecord = {
        title: `[PUSH] ${newPushTitle.trim()}`,
        highlight: newPushBody.trim(),
        subtitle: 'Notificação AtriosWork Push',
        cta_text: 'Abrir App',
        cta_link: '/',
        theme_color: 'amber',
        is_active: true,
        user_type: newPushAudience === 'all' ? 'push_notification' : (newPushAudience === 'premium' ? 'premium' : 'free'),
        image_url: null
      };

      const { error } = await supabase.from('app_banners').insert([pushRecord]);
      if (error) throw error;

      let clientFcmMsg = '';
      let clientFcmSuccess = false;

      // Se houver uma conta de serviço configurada, enviar direto pelo navegador via FCM HTTP v1
      if (fcmServiceAccount.trim()) {
        try {
          const sa = JSON.parse(fcmServiceAccount.trim());
          const projectId = sa.project_id;
          const clientEmail = sa.client_email;
          const privateKey = sa.private_key;

          if (!projectId || !clientEmail || !privateKey) {
            throw new Error("O ficheiro JSON não contém todas as chaves necessárias (project_id, client_email, private_key).");
          }

          // Buscar tokens FCM ativos do Supabase
          let query = supabase
            .from('profiles')
            .select('id, fcm_token, name, role')
            .not('fcm_token', 'is', null);

          const { data: allProfiles, error: profErr } = await query;
          if (profErr) throw profErr;

          let filteredProfiles = allProfiles || [];
          if (newPushAudience === 'premium') {
            filteredProfiles = filteredProfiles.filter(p => {
              const sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
              return sub && sub.isActive === true;
            });
          } else if (newPushAudience === 'free') {
            filteredProfiles = filteredProfiles.filter(p => {
              const sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
              return !sub || sub.isActive !== true;
            });
          }

          const validTokens = filteredProfiles
            .map(p => p.fcm_token)
            .filter((t): t is string => !!t && t.trim().length > 0);

          if (validTokens.length > 0) {
            const { successCount, errors } = await sendClientSideFCM(
              projectId,
              clientEmail,
              privateKey,
              validTokens,
              newPushTitle.trim(),
              newPushBody.trim()
            );
            if (successCount > 0) {
              clientFcmSuccess = true;
              clientFcmMsg = `Enviado com sucesso diretamente pelo seu navegador para ${successCount} de ${validTokens.length} dispositivos ativos via FCM.`;
              if (errors.length > 0) {
                clientFcmMsg += ` Alguns avisos de erro em alguns dispositivos: ${errors.join('; ')}`;
              }
            } else {
              clientFcmSuccess = false;
              const detailedErr = errors.join('; ');
              if (detailedErr.includes("403") || detailedErr.toLowerCase().includes("permission") || detailedErr.toLowerCase().includes("forbidden") || detailedErr.toLowerCase().includes("not been used")) {
                clientFcmMsg = `Erro 403 (Permissão Negada): Certifique-se de que a API "Firebase Cloud Messaging API (V1)" está ATIVADA no Google Cloud Console do projeto "${projectId}" (e que as credenciais inseridas têm acesso). Detalhes: ${detailedErr}`;
              } else if (detailedErr.toLowerCase().includes("sender_id_mismatch") || detailedErr.toLowerCase().includes("mismatch") || detailedErr.toLowerCase().includes("not-registered")) {
                clientFcmMsg = `Erro de Mismatch / Token Inválido: Os tokens gerados no telemóvel dos utilizadores pertencem a outro projeto Firebase. Se está a usar o seu projeto Firebase "${projectId}" para enviar notificações, também deve configurar as credenciais do seu projeto Firebase no frontend (variáveis .env como VITE_FIREBASE_*) para que os tokens coincidam com o seu projeto!`;
              } else {
                clientFcmMsg = `Erro no envio FCM: ${detailedErr}`;
              }
            }
          } else {
            clientFcmMsg = "Nenhum dispositivo encontrado com token push registado para esta audiência.";
          }
        } catch (fcmClientErr: any) {
          console.error("Erro ao enviar via FCM direto no navegador:", fcmClientErr);
          clientFcmMsg = `Aviso: Erro ao despachar diretamente via FCM (${fcmClientErr.message}).`;
        }
      }

      // Tenta chamar a Edge Function como redundância
      try {
        await supabase.functions.invoke('send-fcm-push', {
          body: {
            title: newPushTitle.trim(),
            body: newPushBody.trim(),
            audience: newPushAudience
          }
        });
      } catch (fcmErr) {
        console.warn('Função de borda do Supabase (send-fcm-push) ainda não implantada ou offline:', fcmErr);
      }

      setNewPushTitle('');
      setNewPushBody('');
      setPushSendResult({
        success: clientFcmSuccess,
        msg: clientFcmSuccess 
          ? `Transmissão concluída! ${clientFcmMsg}`
          : `Transmissão falhou ou precisa de ajuste: ${clientFcmMsg}`
      });
      fetchData();
    } catch (err: any) {
      const isUserTypeErr = err.message?.includes('user_type') || err.message?.includes('column') || JSON.stringify(err).includes('user_type');
      setPushSendResult({
        success: false,
        msg: isUserTypeErr 
          ? `Erro: A tabela 'app_banners' não possui a coluna 'user_type' no seu Supabase.\n\nPara corrigir, aceda ao painel do Supabase > SQL Editor e execute:\n\nALTER TABLE app_banners ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'all';\n\n(E depois recarregue esta página!)`
          : `Falha ao transmitir push: ${err.message}`
      });
    } finally {
      setIsSendingPush(false);
    }
  };

  const handleSaveFcmClientConfig = async () => {
    setIsSavingClientConfig(true);
    try {
      if (!fcmClientConfig.trim()) {
        // Remover a configuração de fcm_config se tiver vazia
        const { error } = await supabase
          .from('app_banners')
          .delete()
          .eq('user_type', 'fcm_config');
        if (error) throw error;
        alert('Configuração de cliente removida com sucesso. O app voltará a usar o Firebase padrão.');
      } else {
        // Validar JSON
        try {
          JSON.parse(fcmClientConfig);
        } catch (e) {
          alert('Erro de Sintaxe: O texto inserido não é um JSON válido. Por favor verifique as aspas e vírgulas.');
          setIsSavingClientConfig(false);
          return;
        }

        // Buscar se já existe
        const { data: existing } = await supabase
          .from('app_banners')
          .select('id')
          .eq('user_type', 'fcm_config')
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('app_banners')
            .update({
              highlight: fcmClientConfig.trim(),
              title: 'FCM Client Config',
              subtitle: 'Configurações de cliente Firebase Customizado para Push Notifications',
              is_active: true
            })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('app_banners')
            .insert([{
              user_type: 'fcm_config',
              title: 'FCM Client Config',
              highlight: fcmClientConfig.trim(),
              subtitle: 'Configurações de cliente Firebase Customizado para Push Notifications',
              is_active: true,
              theme_color: 'blue'
            }]);
          if (error) throw error;
        }
        alert('Configuração de cliente gravada e publicada com sucesso! Agora todos os telemóveis dos utilizadores vão registar-se no seu projeto customizado.');
      }
    } catch (err: any) {
      alert(`Erro ao gravar configuração: ${err.message}`);
    } finally {
      setIsSavingClientConfig(false);
    }
  };

  const handleToggleBanner = async (banner: AppBanner) => {
    setUpdatingId(banner.id);
    try {
      await supabase.from('app_banners').update({ is_active: !banner.is_active }).eq('id', banner.id);
      fetchData();
    } catch (e) { console.error(e); } finally { setUpdatingId(null); }
  };

  const handleToggleUserStatus = async (inputUser: any) => {
    setUpdatingId(inputUser.id);
    try {
      const rawSub = inputUser.subscription || inputUser.profile?.subscription;
      let sub: any = {};
      if (typeof rawSub === 'string') { try { sub = JSON.parse(rawSub); } catch(e) { sub = {}; } } 
      else { sub = rawSub || {}; }
      
      const nextStatus = sub.isActive === false;
      const updatedSub = { ...sub, isActive: nextStatus };
      
      const { error } = await supabase.from('profiles').update({ subscription: updatedSub }).eq('id', inputUser.id);
      if (error) throw error;
      await fetchData();
    } catch (e: any) {
      alert(`Erro ao mudar status: ${e.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePromoteUser = async (userId: string, days: number) => {
    setUpdatingId(userId);
    try {
      const { data: profile } = await supabase.from('profiles').select('subscription').eq('id', userId).single();
      let sub: any = {};
      if (typeof profile?.subscription === 'string') sub = JSON.parse(profile.subscription);
      else sub = profile?.subscription || {};

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      const updatedSub = { 
        ...sub, 
        status: 'ACTIVE_PAID', 
        isActive: true,
        expiryDate: expiryDate.toISOString(),
        promotionDays: days
      };

      const { error } = await supabase.from('profiles').update({ subscription: updatedSub }).eq('id', userId);
      if (error) throw error;
      
      setPromotingUser(null);
      await fetchData();
    } catch (e: any) {
      alert(`Erro ao promover: ${e.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateVendorCommission = async () => {
    if (!editingCommissionVendor || isSavingComm) return;
    setIsSavingComm(true);
    try {
      await supabase.from('vendors').update({ commission_rate: newCommRate }).eq('id', editingCommissionVendor.id);
      const { data: profileData } = await supabase.from('profiles').select('subscription').eq('id', editingCommissionVendor.id).maybeSingle();
      if (profileData) {
        let sub: any = {};
        if (typeof profileData.subscription === 'string') { try { sub = JSON.parse(profileData.subscription); } catch(e) { sub = {}; } }
        else { sub = profileData.subscription || {}; }
        const updatedSub = { ...sub, custom_commission: newCommRate, custom_discount: newDiscRate };
        await supabase.from('profiles').update({ subscription: updatedSub }).eq('id', editingCommissionVendor.id);
      }
      setEditingCommissionVendor(null);
      await fetchData();
    } catch (e: any) {
      alert(`Erro AtriosWork: ${e.message}`);
    } finally {
      setIsSavingComm(false);
    }
  };

  const executeDeletion = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      if (itemToDelete.type === 'banner') await supabase.from('app_banners').delete().eq('id', itemToDelete.id);
      else {
        if (itemToDelete.type === 'vendor') await supabase.from('vendors').delete().eq('id', itemToDelete.id);
        await supabase.from('profiles').delete().eq('id', itemToDelete.id);
      }
      fetchData();
      setItemToDelete(null);
    } catch (e: any) { alert(e.message); } finally { setIsDeleting(false); }
  };

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (activeSubTab === 'users') return users.filter(u => u.name.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term));
    if (activeSubTab === 'vendors') return vendors.filter(v => v.name.toLowerCase().includes(term) || v.code.toLowerCase().includes(term));
    if (activeSubTab === 'support') return supportStaff.filter(s => s.name.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term));
    if (activeSubTab === 'banners') {
      return banners
        .filter(b => !b.title.toUpperCase().includes('[PUSH]') && (b.user_type as string) !== 'push_notification')
        .filter(b => b.title.toLowerCase().includes(term) || b.highlight.toLowerCase().includes(term));
    }
    return [];
  }, [searchTerm, users, vendors, supportStaff, banners, activeSubTab]);

  const getDaysRemaining = (subRaw: any) => {
    try {
      let sub = subRaw;
      if (typeof subRaw === 'string') sub = JSON.parse(subRaw);
      
      let expiry;
      if (sub?.expiryDate) {
        expiry = parseISO(sub.expiryDate);
      } else if (sub?.startDate) {
        expiry = addYears(parseISO(sub.startDate), 1);
      } else {
        return '---';
      }

      const diffMs = expiry.getTime() - now.getTime();
      
      if (diffMs <= 0) return 'Expirado';

      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
      }
      return `${hours}h ${minutes}m ${seconds}s`;
    } catch (e) {
      return '---';
    }
  };

  const getAtriosWorkIdDisplay = (u: any) => {
    if (hideValues) return "••••••••";
    const sub = typeof u.subscription === 'string' ? JSON.parse(u.subscription) : (u.subscription || {});
    return sub.id || u.id?.substring(0, 8).toUpperCase() || '---';
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] pb-64">
      <div className="flex flex-col xl:flex-row gap-6 justify-between items-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`w-4 h-4 ${isMaster ? 'text-amber-500' : 'text-purple-400'}`} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{isMaster ? 'AtriosWork Master Core Management' : 'AtriosWork Command OS'}</span>
          </div>
          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">ATRIOS<span className={isMaster ? 'text-amber-500' : 'text-purple-400'}>{isMaster ? 'WORK' : 'COMMAND'}</span></h2>
        </div>
        
        <div className="flex gap-2 p-1 bg-slate-800/40 rounded-2xl border border-slate-700/50 flex-wrap">
          {isMaster && <button onClick={() => setActiveSubTab('analytics')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'analytics' ? 'bg-amber-600 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>Dashboard</button>}
          {isMaster && <button onClick={() => setActiveSubTab('ledger')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'ledger' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Plataforma</button>}
          <button onClick={() => setActiveSubTab('notifications')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'notifications' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}><BellRing className="w-3.5 h-3.5 inline mr-1" /> Alertas</button>
          <button onClick={() => setActiveSubTab('users')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'users' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Membros</button>
          <button onClick={() => setActiveSubTab('banners')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'banners' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Banners</button>
          <button onClick={() => setActiveSubTab('vendors')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'vendors' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Parceiros</button>
          <button onClick={() => setActiveSubTab('support')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'support' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Suporte</button>
          <button onClick={() => setActiveSubTab('reports')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'reports' ? 'bg-amber-600 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>Comissões</button>
          <button onClick={() => setActiveSubTab('profile')} className={`px-4 py-2 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${activeSubTab === 'profile' ? 'bg-slate-200 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}><Settings className="w-3.5 h-3.5 inline mr-1" /> Perfil</button>
        </div>
      </div>

      {activeSubTab === 'analytics' ? <AdminGlobalAnalytics f={f} /> : 
       activeSubTab === 'ledger' ? <AdminPlatformLedger f={f} /> :
       activeSubTab === 'reports' ? <AdminPartnerReports f={f} /> : 
       activeSubTab === 'profile' ? <SettingsPage user={currentUser!} setUser={onUpdateProfile} t={t} hideValues={hideValues} /> : 
       activeSubTab === 'notifications' ? (
         <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="bg-slate-800/20 border border-blue-500/20 p-10 rounded-[3rem] space-y-8 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none"><Webhook className="w-64 h-64 text-blue-500" /></div>
               <div className="space-y-2 relative z-10">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter font-sans">Central de <span className="text-blue-400">Notificações Push</span></h3>
                </div>

                {/* Estatísticas Rápidas de Dispositivos */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10 font-sans">
                  <div className="bg-slate-950/60 p-6 rounded-[2rem] border border-white/5 space-y-2 animate-[fadeIn_0.4s_ease-out]">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Membros do Painel</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold font-mono text-white">{users.length}</span>
                      <span className="text-[10px] font-black text-emerald-400 uppercase">Utilizadores</span>
                    </div>
                    <p className="text-[9px] text-slate-600 font-bold uppercase leading-snug">Todos que se registaram e podem aceitar alertas em sua conta.</p>
                  </div>

                  <div className="bg-slate-950/60 p-6 rounded-[2rem] border border-white/5 space-y-2 animate-[fadeIn_0.5s_ease-out]">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Canal PWA Activos</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold font-mono text-emerald-400">PWA</span>
                      <span className="text-[10px] font-black text-emerald-500 uppercase">Habilitado</span>
                    </div>
                    <p className="text-[9px] text-slate-600 font-bold uppercase leading-snug">Dispositivos preparados com Service Worker para receção imediata.</p>
                  </div>

                  <div className="bg-slate-950/60 p-6 rounded-[2rem] border border-white/5 space-y-2 animate-[fadeIn_0.6s_ease-out]">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Notificações Nativa</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold font-mono text-blue-400">Push</span>
                      <span className="text-[10px] font-black text-blue-500 uppercase">Configurado</span>
                    </div>
                    <p className="text-[9px] text-slate-600 font-bold uppercase leading-snug">Transmissão em loop directo por eventos de sincronização Supabase.</p>
                  </div>
                </div>

                {/* Configuração Local FCM da Conta de Serviço */}
                <div className="bg-slate-950/70 p-6 rounded-[2rem] border border-white/5 space-y-4 relative z-10 font-sans">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowFcmConfig(!showFcmConfig)}>
                    <div className="flex items-center gap-3">
                      <KeySquare className="w-5 h-5 text-blue-400" />
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Configuração da Conta de Serviço Firebase (FCM)</h4>
                        <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">
                          {fcmServiceAccount ? "✅ Chave privada guardada localmente" : "⚠️ Chave não configurada - Envio via FCM offline desativado"}
                        </p>
                      </div>
                    </div>
                    <button type="button" className="text-[10px] font-black text-blue-400 hover:text-blue-300 uppercase tracking-widest">
                      {showFcmConfig ? "Ocultar" : "Configurar"}
                    </button>
                  </div>

                  {showFcmConfig && (
                    <div className="space-y-4 pt-4 border-t border-white/5 animate-[fadeIn_0.3s_ease-out]">
                      <p className="text-[10px] text-slate-400 leading-relaxed font-bold uppercase">
                        Para enviar notificações push nativas em tempo real para dispositivos offline sem necessitar de instalar Docker ou servidores locais, cole abaixo o conteúdo completo do seu ficheiro JSON da Conta de Serviço do Firebase (gerado nas definições do Firebase console &gt; Contas de serviço).
                      </p>
                      <div className="space-y-2">
                        <textarea
                          rows={6}
                          placeholder='{ "type": "service_account", "project_id": "push-atrios-work", ... }'
                          value={fcmServiceAccount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFcmServiceAccount(val);
                            if (val.trim()) {
                              localStorage.setItem('fcm_service_account', val.trim());
                            } else {
                              localStorage.removeItem('fcm_service_account');
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-850 rounded-2xl px-5 py-4 text-white text-[11px] font-mono outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">
                          Armazenado de forma segura e local no localStorage do seu navegador.
                        </span>
                        {fcmServiceAccount && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Deseja mesmo remover a chave privada?")) {
                                setFcmServiceAccount('');
                                localStorage.removeItem('fcm_service_account');
                              }
                            }}
                            className="text-[9px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest"
                          >
                            Remover Chave
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Configuração de Cliente Web Firebase (Público) em cartão independente */}
                <div className="bg-slate-950/70 p-6 rounded-[2rem] border border-white/5 space-y-4 relative z-10 font-sans">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-blue-400" />
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-widest">Configuração do Cliente Web Firebase (Frontend / Telemóvel)</h4>
                      <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">
                        {fcmClientConfig ? "✅ Configuração de Cliente gravada e publicada" : "⚠️ Usando o projeto Firebase padrão do workspace"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <p className="text-[10px] text-slate-400 leading-relaxed font-bold uppercase">
                      Para que os telemóveis e computadores dos seus colaboradores registem os tokens de push no seu projeto Firebase customizado em vez do projeto padrão do workspace, cole abaixo o objeto JSON de configuração web do seu Firebase (gerado no painel do Firebase Console &gt; Definições do Projeto &gt; Os seus apps).
                    </p>
                    <div className="space-y-2">
                      <textarea
                        rows={5}
                        placeholder={`{
  "apiKey": "AIzaSy...",
  "authDomain": "push-atrios-work.firebaseapp.com",
  "projectId": "push-atrios-work",
  "storageBucket": "push-atrios-work.appspot.com",
  "messagingSenderId": "1234567890",
  "appId": "1:12345:web:abcd",
  "vapidKey": "B..." // Opcional: Chave VAPID pública de Web Push Certificates
}`}
                        value={fcmClientConfig}
                        onChange={(e) => setFcmClientConfig(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-850 rounded-2xl px-5 py-4 text-white text-[11px] font-mono outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">
                        Isto sincroniza com a base de dados Supabase e atualiza automaticamente todos os utilizadores ativos.
                      </span>
                      <button
                        type="button"
                        onClick={handleSaveFcmClientConfig}
                        disabled={isSavingClientConfig}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {isSavingClientConfig ? 'A Guardar...' : 'Guardar Configuração'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
                  {/* Formulário de Envio */}
                  <form onSubmit={handleSendPushNotification} className="bg-slate-950/70 p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                      <Megaphone className="w-5 h-5 text-amber-500 animate-pulse" />
                      <h4 className="text-xs font-black text-white uppercase tracking-widest font-sans">Escrever Notificação Push</h4>
                    </div>

                    {pushSendResult && (
                      <div className={`p-4 rounded-2xl border text-[10px] font-bold uppercase tracking-wider ${pushSendResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                        {pushSendResult.msg}
                      </div>
                    )}

                    <div className="space-y-2 relative">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Título da Notificação</label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowTitleEmojiPicker(!showTitleEmojiPicker);
                            setShowBodyEmojiPicker(false);
                          }}
                          className="text-slate-500 hover:text-amber-500 transition-colors p-1"
                          title="Inserir Emoji"
                        >
                          <Smile className="w-4.5 h-4.5" />
                        </button>
                      </div>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Ex: ⚠️ Atualização de Assinatura" 
                          value={newPushTitle}
                          onChange={(e) => setNewPushTitle(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-850 rounded-2xl px-5 py-4 text-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                        {showTitleEmojiPicker && (
                          <div className="absolute z-50 right-0 top-14 shadow-2xl border border-white/10 rounded-2xl overflow-hidden scale-90 origin-top-right">
                            <EmojiPicker 
                              theme={Theme.DARK}
                              emojiStyle={EmojiStyle.NATIVE}
                              onEmojiClick={(emojiData) => {
                                setNewPushTitle(prev => prev + emojiData.emoji);
                                setShowTitleEmojiPicker(false);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 relative">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mensagem da Notificação</label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBodyEmojiPicker(!showBodyEmojiPicker);
                            setShowTitleEmojiPicker(false);
                          }}
                          className="text-slate-500 hover:text-amber-500 transition-colors p-1"
                          title="Inserir Emoji"
                        >
                          <Smile className="w-4.5 h-4.5" />
                        </button>
                      </div>
                      <div className="relative">
                        <textarea 
                          rows={3}
                          placeholder="Ex: Sua assinatura Pro está prestes a expirar amanhã. Renove já no menu de faturamento." 
                          value={newPushBody}
                          onChange={(e) => setNewPushBody(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-850 rounded-2xl px-5 py-4 text-white text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          required
                        />
                        {showBodyEmojiPicker && (
                          <div className="absolute z-50 right-0 top-14 shadow-2xl border border-white/10 rounded-2xl overflow-hidden scale-90 origin-top-right">
                            <EmojiPicker 
                              theme={Theme.DARK}
                              emojiStyle={EmojiStyle.NATIVE}
                              onEmojiClick={(emojiData) => {
                                setNewPushBody(prev => prev + emojiData.emoji);
                                setShowBodyEmojiPicker(false);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtro de Audiência</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'all', label: 'Todos' },
                          { id: 'free', label: 'Grátis' },
                          { id: 'premium', label: 'Pro' }
                        ].map((aud) => (
                          <button
                            key={aud.id}
                            type="button"
                            onClick={() => setNewPushAudience(aud.id as any)}
                            className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${newPushAudience === aud.id ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-900 border-slate-850 text-slate-400 hover:text-white'}`}
                          >
                            {aud.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Opção de Agendamento */}
                    <div className="space-y-4 border-t border-white/5 pt-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 font-sans">
                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                          Agendar Envio para o futuro?
                        </label>
                        <input 
                          type="checkbox" 
                          checked={isScheduled}
                          onChange={(e) => {
                            setIsScheduled(e.target.checked);
                            if (e.target.checked) {
                              const futureDate = new Date();
                              futureDate.setMinutes(futureDate.getMinutes() + 30);
                              setScheduledDate(futureDate.toISOString().split('T')[0]);
                              setScheduledTime(futureDate.toTimeString().split(' ')[0].substring(0, 5));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </div>

                      {isScheduled && (
                        <div className="grid grid-cols-2 gap-4 animate-[fadeIn_0.3s_ease-out]">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest font-sans">Data de Envio</label>
                            <input 
                              type="date" 
                              value={scheduledDate}
                              onChange={(e) => setScheduledDate(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-850 rounded-xl px-4 py-2.5 text-white text-[11px] outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                              required={isScheduled}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest font-sans">Hora de Envio</label>
                            <input 
                              type="time" 
                              value={scheduledTime}
                              onChange={(e) => setScheduledTime(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-850 rounded-xl px-4 py-2.5 text-white text-[11px] outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                              required={isScheduled}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingPush}
                      className={`w-full py-4 bg-gradient-to-r ${isScheduled ? 'from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500' : 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'} text-white font-black rounded-2xl text-[9px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
                    >
                      {isSendingPush ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {isScheduled ? 'A Agendar...' : 'Transmitindo...'}
                        </>
                      ) : (
                        <>
                          {isScheduled ? 'Confirmar Agendamento de Push' : 'Transmitir Notificação Push'}
                        </>
                      )}
                    </button>
                  </form>

                  {/* Histórico e Agendamentos de Notificações */}
                  <div className="bg-slate-950/70 p-8 rounded-[2.5rem] border border-white/5 space-y-6 flex flex-col h-[480px]">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0 font-sans">
                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={() => setPushHistoryTab('sent')}
                          className={`text-xs font-black uppercase tracking-widest pb-1 transition-all ${pushHistoryTab === 'sent' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          Enviados
                        </button>
                        <button
                          type="button"
                          onClick={() => setPushHistoryTab('scheduled')}
                          className={`text-xs font-black uppercase tracking-widest pb-1 transition-all ${pushHistoryTab === 'scheduled' ? 'text-amber-400 border-b-2 border-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          Agendados
                        </button>
                      </div>
                      
                      {pushHistoryTab === 'sent' ? (
                        <span className="px-3 py-1 bg-slate-900 rounded-full text-[8px] font-black text-slate-500 uppercase tracking-wider font-mono">
                          {banners.filter(p => p.title.toUpperCase().includes('[PUSH]') || (p.user_type as string) === 'push_notification').length} Enviadas
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-slate-900 rounded-full text-[8px] font-black text-amber-500/80 uppercase tracking-wider font-mono">
                          {banners.filter(p => (p.user_type as string) === 'push_scheduled').length} Agendados
                        </span>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                      {pushHistoryTab === 'sent' ? (
                        banners.filter(p => p.title.toUpperCase().includes('[PUSH]') || (p.user_type as string) === 'push_notification').length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-3 font-sans">
                            <BellRing className="w-10 h-10 text-slate-750 animate-pulse" />
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Nenhuma Notificação Transmitida</p>
                          </div>
                        ) : (
                          banners
                            .filter(p => p.title.toUpperCase().includes('[PUSH]') || (p.user_type as string) === 'push_notification')
                            .map((push) => {
                              const displayTitle = push.title.replace('[PUSH]', '').replace('[push]', '').trim();
                              const displayAudience = (push.user_type as string) === 'push_notification' || push.user_type === 'all' ? 'TODOS' : 
                                                      (push.user_type === 'premium' ? 'PRO' : 'GRÁTIS');
                              
                              return (
                                <div key={push.id} className="p-4 bg-slate-900 rounded-2xl border border-white/5 flex gap-3 justify-between items-start hover:border-slate-800 transition-all group font-sans">
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`px-2 py-0.5 rounded-[0.5rem] text-[7px] font-black uppercase tracking-wider ${
                                        displayAudience === 'TODOS' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                        displayAudience === 'PRO' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                        'bg-slate-800 text-slate-400'
                                      }`}>
                                        {displayAudience}
                                      </span>
                                      <span className="text-[8px] font-mono text-slate-600 font-bold">
                                        {push.created_at ? new Date(push.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                                      </span>
                                    </div>
                                    <h5 className="text-[10px] font-black text-white truncate uppercase tracking-widest leading-none">{displayTitle}</h5>
                                    <p className="text-[9px] font-bold text-slate-500 leading-relaxed">{push.highlight || push.subtitle}</p>
                                  </div>
                                  
                                  <button
                                    type="button"
                                    onClick={() => setItemToDelete({ id: push.id, name: displayTitle, type: 'banner' })}
                                    className="p-2 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title="Remover Notificação"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })
                        )
                      ) : (
                        banners.filter(p => (p.user_type as string) === 'push_scheduled').length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-3 font-sans">
                            <Calendar className="w-10 h-10 text-slate-750 animate-pulse" />
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Nenhum Agendamento Ativo</p>
                          </div>
                        ) : (
                          banners
                            .filter(p => (p.user_type as string) === 'push_scheduled')
                            .map((push) => {
                              const displayTitle = push.title.replace('[SCHEDULED]', '').trim();
                              const displayAudience = push.subtitle === 'all' ? 'TODOS' : (push.subtitle === 'premium' ? 'PRO' : 'GRÁTIS');
                              
                              let schedDateStr = '---';
                              try {
                                schedDateStr = new Date(push.cta_link).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                              } catch (e) {}

                              return (
                                <div key={push.id} className="p-4 bg-slate-900 rounded-2xl border border-white/5 flex gap-3 justify-between items-start hover:border-slate-800 transition-all group font-sans">
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="px-2 py-0.5 rounded-[0.5rem] text-[7px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        AGENDADO: {schedDateStr}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-[0.5rem] text-[7px] font-black uppercase tracking-wider ${
                                        displayAudience === 'TODOS' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                        displayAudience === 'PRO' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                        'bg-slate-800 text-slate-400'
                                      }`}>
                                        {displayAudience}
                                      </span>
                                    </div>
                                    <h5 className="text-[10px] font-black text-white truncate uppercase tracking-widest leading-none">{displayTitle}</h5>
                                    <p className="text-[9px] font-bold text-slate-500 leading-relaxed">{push.highlight}</p>
                                  </div>
                                  
                                  <button
                                    type="button"
                                    onClick={() => setItemToDelete({ id: push.id, name: `Agendamento: ${displayTitle}`, type: 'banner' })}
                                    className="p-2 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title="Remover Agendamento"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Ajuda/Avisos de Webhooks legados preservados */}
                <div className="pt-4 border-t border-slate-850 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-slate-900/60 rounded-3xl border border-white/5 space-y-2">
                     <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-blue-400" />
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-300 font-sans">Notificações por E-mail</h5>
                     </div>
                     <p className="text-[10px] text-slate-500 leading-relaxed">
                       Para encaminhar novos tickets de suporte para <strong>software.atrios@gmail.com</strong>, utilize o Webhook do Supabase apontado para um serviço do SendGrid/Resend.
                     </p>
                  </div>
                  
                  <div className="p-6 bg-slate-900/60 rounded-3xl border border-white/5 space-y-2">
                     <div className="flex items-center gap-3">
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-300 font-sans">Canal Push Nativo Activo</h5>
                     </div>
                     <p className="text-[10px] text-slate-500 leading-relaxed italic">
                       As notificações Push nativas dependem do consentimento do utilizador. Incentive-os a clicar em "Autorizar Push" no popup de início de sessão.
                     </p>
                  </div>
                </div>
          </div>
          </div>
        ) : (
         <div className="bg-slate-800/20 border border-slate-800 rounded-[2.5rem] overflow-hidden backdrop-blur-md shadow-2xl relative">
          <div className="p-8 border-b border-slate-800 flex flex-col md:flex-row gap-6 justify-between items-center bg-slate-900/40">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" placeholder="Pesquisar..." className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white text-sm outline-none focus:ring-2 focus:ring-purple-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            
            <div className="flex gap-3">
              {activeSubTab === 'banners' && (
                <button onClick={() => setShowSqlHelp(true)} className="px-6 py-4 bg-slate-900 text-amber-500 border border-amber-500/30 font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all hover:bg-amber-500/10"><Database className="w-4 h-4" /> DB Setup</button>
              )}
              {activeSubTab === 'banners' ? (
                <button onClick={() => setShowAddBanner(true)} className="px-8 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg"><Plus className="w-4 h-4" /> Novo Banner</button>
              ) : activeSubTab === 'users' ? (
                <button onClick={() => setShowAddUser(true)} className="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg"><UserPlus className="w-4 h-4" /> Novo Membro</button>
              ) : activeSubTab === 'vendors' ? (
                <button onClick={() => setShowAddVendor(true)} className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg"><Plus className="w-4 h-4" /> Novo Parceiro</button>
              ) : (
                <button onClick={fetchData} className="p-4 bg-slate-900 text-slate-500 hover:text-white rounded-xl border border-white/5 transition-all"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950/30 text-slate-500 text-[10px] uppercase font-black tracking-[0.2em] border-b border-slate-800">
                  <th className="px-10 py-6">{activeSubTab === 'banners' ? 'Mídia / Título' : 'Identidade'}</th>
                  <th className="px-6 py-6 text-center">{activeSubTab === 'banners' ? 'Cor' : activeSubTab === 'users' ? 'AtriosWork ID' : 'Canal'}</th>
                  <th className="px-6 py-6 text-center">Status</th>
                  {activeSubTab !== 'banners' && <th className="px-6 py-6 text-center">Expiração</th>}
                  <th className="px-10 py-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {loading ? (
                  <tr><td colSpan={5} className="py-20 text-center"><Loader2 className="w-10 h-10 text-white animate-spin mx-auto" /></td></tr>
                ) : filteredData.length === 0 ? (
                  <tr><td colSpan={5} className="py-20 text-center text-slate-600 font-bold uppercase tracking-widest">Nenhum registo encontrado.</td></tr>
                ) : activeSubTab === 'banners' ? (
                  (filteredData as AppBanner[]).map((b) => (
                    <tr key={b.id} className="transition-all hover:bg-slate-800/40">
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-16 h-10 rounded-lg bg-${b.theme_color}-500/20 border border-${b.theme_color}-500/30 flex items-center justify-center overflow-hidden`}>
                             {b.image_url ? <img src={b.image_url} className="w-full h-full object-cover" alt="" /> : <Megaphone className={`w-5 h-5 text-${b.theme_color}-400`} />}
                          </div>
                          <div><p className="font-bold text-white text-sm">{b.title}</p><p className="text-[9px] text-slate-500 uppercase font-black">{b.highlight}</p></div>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className={`w-4 h-4 rounded-full mx-auto bg-${b.theme_color}-500 shadow-lg shadow-${b.theme_color}-500/20`}></div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${
                          b.user_type === 'premium' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                          b.user_type === 'free' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          b.user_type === 'public' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                          {b.user_type === 'premium' ? 'PREMIUM' : b.user_type === 'free' ? 'GRATUITO' : b.user_type === 'public' ? 'PÚBLICO (PRÉ-LOGIN)' : 'TODOS'}
                        </span>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${ b.is_active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{b.is_active ? 'EXIBINDO' : 'PAUSADO'}</div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleToggleBanner(b)} disabled={updatingId === b.id} className={`p-2.5 rounded-xl transition-all ${b.is_active ? 'bg-slate-950 text-slate-500' : 'bg-green-600/20 text-green-500'}`}>
                            <Power className={`w-4 h-4 ${updatingId === b.id ? 'animate-spin' : ''}`} />
                          </button>
                          <button onClick={() => setItemToDelete({ id: b.id, name: b.title, type: 'banner' })} className="p-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : activeSubTab === 'vendors' ? (
                   (filteredData as any[]).map((v: any) => {
                     const rawSub = v.profile?.subscription;
                     let sub: any = {};
                     if (typeof rawSub === 'string') { try { sub = JSON.parse(rawSub); } catch(e) {} } else { sub = rawSub || {}; }
                     const isSuspended = sub.isActive === false;
                     return (
                      <tr key={v.id} className="transition-all hover:bg-slate-800/40 group print:text-black">
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-green-600/20 border border-green-600/30 flex items-center justify-center font-black text-green-400 text-lg shadow-xl">{v.name?.charAt(0)}</div>
                            <div>
                               <p className="font-bold text-white text-sm print:text-black">{v.name}</p>
                               <div className="flex items-center gap-2 bg-slate-950 px-2 py-0.5 rounded border border-white/5 mt-1 w-fit">
                                  <Tag className="w-2.5 h-2.5 text-slate-500" />
                                  <p className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest">{v.code}</p>
                               </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6 text-center">
                           <p className="text-white text-[11px] font-medium">{v.email}</p>
                           <p className="text-[9px] text-green-500 font-black uppercase mt-1">Comm: {hideValues ? "••••" : f(v.commission_rate)}</p>
                        </td>
                        <td className="px-6 py-6 text-center">
                          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${ !isSuspended ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{!isSuspended ? 'ATIVO' : 'SUSPENSO'}</div>
                        </td>
                        <td className="px-6 py-6 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-xs text-white uppercase font-black tracking-widest">{getDaysRemaining(v.profile?.subscription)}</p>
                            {sub?.expiryDate && (
                              <div className="flex items-center gap-1 text-[8px] text-amber-500 font-black uppercase animate-pulse">
                                <Zap className="w-2 h-2" /> Promoção Ativa
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button title="Ver Página" onClick={() => onViewVendor?.(v.id)} className="p-2.5 bg-slate-950 text-slate-500 border border-white/5 rounded-xl hover:text-white transition-all"><Award className="w-4 h-4" /></button>
                            <button title="Ver Gaveta de Vendas" onClick={() => onViewVendorSales?.(v)} className="p-2.5 bg-blue-600/10 text-blue-400 border border-blue-600/20 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><ShoppingCart className="w-4 h-4" /></button>
                            <button title="Configurar Comissões" onClick={() => { 
                                setEditingCommissionVendor(v); 
                                setNewCommRate(v.commission_rate); 
                                const vSub = typeof v.profile?.subscription === 'string' ? JSON.parse(v.profile.subscription) : v.profile?.subscription;
                                setNewDiscRate(vSub?.custom_discount ?? 5); 
                            }} className="p-2.5 bg-amber-600/10 text-amber-500 border border-amber-600/20 rounded-xl hover:bg-amber-600 hover:text-slate-950 transition-all"><Settings2 className="w-4 h-4" /></button>
                            <button title={!isSuspended ? "Desativar" : "Ativar"} onClick={() => handleToggleUserStatus(v)} disabled={updatingId === v.id} className={`p-2.5 rounded-xl transition-all ${!isSuspended ? 'bg-slate-950 text-slate-500' : 'bg-green-600/20 text-green-500'}`}>
                              <Power className="w-4 h-4" />
                            </button>
                            <button onClick={() => setItemToDelete({ id: v.id, name: v.name, type: 'vendor' })} className="p-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                     );
                   })
                ) : (
                  (filteredData as UserProfile[]).map((u: any) => {
                    const rawSub = u.subscription;
                    let sub: any = {};
                    if (typeof rawSub === 'string') { try { sub = JSON.parse(rawSub); } catch(e) {} } else { sub = rawSub || {}; }
                    const isSuspended = sub.isActive === false;
                    return (
                      <tr key={u.id} className="transition-all hover:bg-slate-800/40">
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center font-black text-purple-400 text-xs">{u.name?.charAt(0)}</div>
                            <div>
                               <p className="font-bold text-white text-sm">{u.name}</p>
                               <p className="text-[9px] text-slate-500 uppercase font-black">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6 text-center">
                          <span className="text-[10px] font-mono font-black text-purple-400 tracking-wider bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20">
                            {getAtriosWorkIdDisplay(u)}
                          </span>
                        </td>
                        <td className="px-6 py-6 text-center">
                           <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${ !isSuspended ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{!isSuspended ? 'ATIVO' : 'SUSPENSO'}</div>
                        </td>
                        <td className="px-6 py-6 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-xs text-white uppercase font-black tracking-widest">{getDaysRemaining(u.subscription)}</p>
                            {sub?.expiryDate && (
                              <div className="flex items-center gap-1 text-[8px] text-amber-500 font-black uppercase animate-pulse">
                                <Zap className="w-2 h-2" /> Promoção Ativa
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isMaster && (
                              <button 
                                title="Remover Restrições" 
                                onClick={() => setPromotingUser(u)} 
                                className="p-2.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl hover:bg-amber-500 hover:text-white transition-all"
                              >
                                <Zap className="w-4 h-4" />
                              </button>
                            )}
                            <button title={!isSuspended ? "Desativar" : "Ativar"} onClick={() => handleToggleUserStatus(u)} disabled={updatingId === u.id} className={`p-2.5 rounded-xl transition-all ${!isSuspended ? 'bg-slate-950 text-slate-500' : 'bg-green-600/20 text-green-500'}`}>
                              <Power className={`w-4 h-4 ${updatingId === u.id ? 'animate-spin' : ''}`} />
                            </button>
                            <button onClick={() => setItemToDelete({ id: u.id, name: u.name, type: activeSubTab === 'support' ? 'support' : 'user' })} className="p-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: REMOVER RESTRIÇÕES */}
      {promotingUser && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/90">
          <div className="bg-slate-900 border border-amber-500/30 w-full max-w-md rounded-[3rem] overflow-hidden shadow-2xl animate-[modalScale_0.3s_ease-out]">
            <div className="p-8 bg-amber-600/10 border-b border-amber-500/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <Zap className="w-6 h-6 text-amber-400" />
                 <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Remover <span className="text-amber-400">Restrições</span></h3>
              </div>
              <button onClick={() => setPromotingUser(null)} className="text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="p-10 space-y-6">
               <p className="text-xs text-slate-400 text-center font-medium leading-relaxed">Selecione o período para libertar todas as funcionalidades premium para <strong>{promotingUser.name}</strong>.</p>
               
               <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: '3 Dias', val: 3 },
                    { label: '7 Dias', val: 7 },
                    { label: '15 Dias', val: 15 },
                    { label: '30 Dias', val: 30 },
                    { label: '150 Dias', val: 150 },
                    { label: '1 Ano', val: 365 }
                  ].map((opt) => (
                    <button 
                      key={opt.val}
                      onClick={() => handlePromoteUser(promotingUser.id!, opt.val)}
                      disabled={updatingId === promotingUser.id}
                      className="py-4 bg-slate-950 border border-slate-800 rounded-2xl text-white font-black uppercase text-[10px] tracking-widest hover:bg-amber-600 hover:text-slate-950 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {updatingId === promotingUser.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                      {opt.label}
                    </button>
                  ))}
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVO BANNER */}
      {showAddBanner && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/90">
          <form onSubmit={handleCreateBanner} className="bg-slate-900 border border-rose-500/30 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-[modalScale_0.3s_ease-out]">
            <div className="p-8 bg-rose-600/10 border-b border-rose-500/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <Megaphone className="w-6 h-6 text-rose-400" />
                 <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Criar <span className="text-rose-400">Novo Banner</span></h3>
              </div>
              <button type="button" onClick={() => setShowAddBanner(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="p-10 space-y-6 overflow-y-auto max-h-[70vh] no-scrollbar">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Título Principal</label>
                    <input required type="text" value={newBanner.title} onChange={e => setNewBanner({...newBanner, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-rose-500" placeholder="Ex: Oferta Especial" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Destaque (Badge)</label>
                    <input type="text" value={newBanner.highlight} onChange={e => setNewBanner({...newBanner, highlight: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-rose-500" placeholder="Ex: NOVIDADE" />
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Subtítulo / Descrição</label>
                  <textarea value={newBanner.subtitle} onChange={e => setNewBanner({...newBanner, subtitle: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-rose-500 resize-none" rows={2} placeholder="Descreva a oferta ou aviso..." />
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Texto do Botão</label>
                    <input type="text" value={newBanner.cta_text} onChange={e => setNewBanner({...newBanner, cta_text: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-rose-500" placeholder="Ver Oferta" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Link do Botão (URL)</label>
                    <input type="text" value={newBanner.cta_link} onChange={e => setNewBanner({...newBanner, cta_link: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-rose-500" placeholder="https://..." />
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Cor do Tema</label>
                    <select value={newBanner.theme_color} onChange={e => setNewBanner({...newBanner, theme_color: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-rose-500 appearance-none">
                       <option value="emerald">Verde (Emerald)</option>
                       <option value="purple">Roxo (Purple)</option>
                       <option value="amber">Laranja (Amber)</option>
                       <option value="rose">Rosa (Rose)</option>
                       <option value="blue">Azul (Blue)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Público Alvo</label>
                    <select value={newBanner.user_type} onChange={e => setNewBanner({...newBanner, user_type: e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-rose-500 appearance-none">
                       <option value="all">Todos os Usuários (Pós-Login)</option>
                       <option value="free">Apenas Versão Gratuita (Pós-Login)</option>
                       <option value="premium">Apenas Versão Premium (Pós-Login)</option>
                       <option value="public">Antes do Login (Landing Page)</option>
                    </select>
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Imagem de Fundo (Upload)</label>
                  <div className="flex gap-4 items-center">
                     <button type="button" onClick={() => bannerFileInputRef.current?.click()} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl border border-dashed border-slate-600 flex items-center justify-center gap-2 transition-all">
                        <Upload className="w-4 h-4" /> Selecionar Imagem
                     </button>
                     {newBanner.image_url && (
                        <div className="w-20 h-12 rounded-xl overflow-hidden border border-white/10">
                           <img src={newBanner.image_url} className="w-full h-full object-cover" alt="Preview" />
                        </div>
                     )}
                     <input type="file" ref={bannerFileInputRef} onChange={handleBannerImageUpload} className="hidden" accept="image/*" />
                  </div>
               </div>

               <div className="pt-4">
                  <button type="submit" disabled={isCreating} className="w-full py-6 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} PUBLICAR BANNER AGORA
                  </button>
               </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NOVO MEMBRO */}
      {showAddUser && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/90">
          <form onSubmit={handleCreateUser} className="bg-slate-900 border border-purple-500/30 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-[modalScale_0.3s_ease-out]">
            <div className="p-8 bg-purple-600/10 border-b border-purple-500/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <UserPlus2 className="w-6 h-6 text-purple-400" />
                 <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Registrar <span className="text-purple-400">Novo Membro</span></h3>
              </div>
              <button type="button" onClick={() => setShowAddUser(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="p-10 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Nome Completo</label>
                    <div className="relative">
                      <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input required type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500" placeholder="Nome do Membro" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Email de Acesso</label>
                    <div className="relative">
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input required type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500" placeholder="email@atrioswork.com" />
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Telemóvel (Opcional)</label>
                    <div className="relative">
                      <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input type="tel" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500" placeholder="+351..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Código do Parceiro</label>
                    <div className="relative">
                      <Tag className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input type="text" value={newUser.vendorCode} onChange={e => setNewUser({...newUser, vendorCode: e.target.value.toUpperCase()})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500" placeholder="EX: AW-12345" />
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Definir Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input required type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500" placeholder="••••••••" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Confirmar Senha</label>
                    <div className="relative">
                      <KeySquare className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input required type="password" value={newUser.confirmPassword} onChange={e => setNewUser({...newUser, confirmPassword: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-purple-500" placeholder="••••••••" />
                    </div>
                  </div>
               </div>

               <div className="pt-4 flex flex-col gap-4">
                  <button type="submit" disabled={isCreating} className="w-full py-6 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} ATIVAR ACESSO IMEDIATO
                  </button>
                  <p className="text-[9px] text-slate-600 font-black uppercase text-center tracking-widest flex items-center justify-center gap-2">
                    <Fingerprint className="w-3 h-3" /> ID AtriosWork gerado automaticamente em sincronia cloud
                  </p>
               </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NOVO PARCEIRO */}
      {showAddVendor && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/90">
          <form onSubmit={handleCreateVendor} className="bg-slate-900 border border-green-500/30 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-[modalScale_0.3s_ease-out]">
            <div className="p-8 bg-green-600/10 border-b border-green-500/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <BriefcaseBusiness className="w-6 h-6 text-green-400" />
                 <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Registrar <span className="text-green-400">Novo Parceiro</span></h3>
              </div>
              <button type="button" onClick={() => setShowAddVendor(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="p-10 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Nome do Parceiro</label>
                    <div className="relative">
                      <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input required type="text" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-green-500" placeholder="Nome da Empresa/Pessoa" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Email Comercial</label>
                    <div className="relative">
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input required type="email" value={newVendor.email} onChange={e => setNewVendor({...newVendor, email: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-green-500" placeholder="comercial@parceiro.com" />
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Telemóvel</label>
                    <div className="relative">
                      <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input type="tel" value={newVendor.phone} onChange={e => setNewVendor({...newVendor, phone: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-green-500" placeholder="+351..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Comissão (€ por venda)</label>
                    <div className="relative">
                      <Euro className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input type="number" step="0.01" value={newVendor.commission} onChange={e => setNewVendor({...newVendor, commission: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-green-500" />
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Definir Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input required type="password" value={newVendor.password} onChange={e => setNewVendor({...newVendor, password: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-green-500" placeholder="••••••••" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Confirmar Senha</label>
                    <div className="relative">
                      <KeySquare className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      <input required type="password" value={newVendor.confirmPassword} onChange={e => setNewVendor({...newVendor, confirmPassword: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none focus:ring-1 focus:ring-green-500" placeholder="••••••••" />
                    </div>
                  </div>
               </div>

               <div className="pt-4 flex flex-col gap-4">
                  <button type="submit" disabled={isCreating} className="w-full py-6 bg-green-600 hover:bg-green-500 text-slate-950 font-black rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} ATIVAR CANAL DE PARCEIRO
                  </button>
                  <p className="text-[9px] text-slate-600 font-black uppercase text-center tracking-widest flex items-center justify-center gap-2">
                    <Tag className="w-3 h-3" /> Código AW-XXXXX gerado automaticamente para o novo parceiro
                  </p>
               </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CONFIGURAR COMISSÃO E DESCONTO */}
      {editingCommissionVendor && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/90">
           <div className="bg-slate-900 border border-amber-500/40 w-full max-w-md rounded-[3rem] p-10 space-y-8 animate-[modalScale_0.3s_ease-out]">
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <Settings2 className="w-6 h-6 text-amber-500" />
                    <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Gestão de <span className="text-amber-500">Taxas</span></h3>
                 </div>
                 <button onClick={() => setEditingCommissionVendor(null)} className="text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
              </div>

              <div className="space-y-4">
                 <div className="flex items-center gap-4 p-4 bg-slate-950 rounded-2xl border border-white/5">
                    <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center font-black text-amber-500">{editingCommissionVendor.name?.charAt(0)}</div>
                    <div><p className="text-xs font-black text-white uppercase">{editingCommissionVendor.name}</p><p className="text-[9px] text-slate-500 font-mono">{editingCommissionVendor.code}</p></div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Valor da Comissão (€)</label>
                    <div className="relative">
                       <Euro className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/40" />
                       <input 
                         type={hideValues ? "password" : "number"} 
                         step="0.01" 
                         value={newCommRate} 
                         onChange={e => setNewCommRate(Number(e.target.value))} 
                         className="w-full bg-slate-950 border border-amber-500/20 rounded-2xl pl-14 pr-6 py-5 text-white font-black text-lg outline-none focus:ring-2 focus:ring-amber-500" 
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Desconto Online (%)</label>
                    <div className="relative">
                       <Percent className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/40" />
                       <input 
                         type={hideValues ? "password" : "number"} 
                         step="0.1" 
                         value={newDiscRate} 
                         onChange={e => setNewDiscRate(Number(e.target.value))} 
                         className="w-full bg-slate-950 border border-amber-500/20 rounded-2xl pl-14 pr-6 py-5 text-white font-black text-lg outline-none focus:ring-2 focus:ring-amber-500" 
                       />
                    </div>
                 </div>
              </div>

              <div className="flex gap-4 pt-4">
                 <button type="button" onClick={() => setEditingCommissionVendor(null)} className="flex-1 py-4 bg-slate-800 text-slate-400 font-black rounded-2xl uppercase text-[10px]">Cancelar</button>
                 <button type="button" onClick={handleUpdateVendorCommission} disabled={isSavingComm} className="flex-1 py-4 bg-amber-600 text-slate-950 font-black rounded-2xl uppercase text-[10px] shadow-xl flex items-center justify-center gap-2 hover:bg-amber-500 transition-all">
                    {isSavingComm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} APLICAR TAXAS
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: SQL HELP */}
      {showSqlHelp && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/90">
          <div className="bg-slate-900 border border-amber-500/40 w-full max-w-2xl rounded-[3rem] p-10 space-y-6 animate-[modalScale_0.3s_ease-out] shadow-2xl shadow-amber-500/10">
            <div className="flex justify-between items-center">
               <div className="flex items-center gap-3"><Database className="w-6 h-6 text-amber-500" /><h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Setup de Base de Dados</h3></div>
               <button onClick={() => setShowSqlHelp(false)} className="text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            <button onClick={() => fetchData()} className="w-full py-5 bg-amber-600 text-slate-950 font-black rounded-2xl uppercase text-[11px] tracking-widest shadow-xl hover:bg-amber-500 transition-all">JÁ EXECUTEI O COMANDO NO SUPABASE</button>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/90">
          <div className="bg-slate-900 border border-red-500/40 w-full max-w-md rounded-[3rem] p-10 text-center space-y-8 animate-[modalScale_0.3s_ease-out]">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30 text-red-500 mx-auto"><Trash2 className="w-10 h-10" /></div>
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">ELIMINAR <span className="text-red-500">DEFINITIVAMENTE?</span></h3>
            <p className="text-slate-400 text-sm">{itemToDelete.name}</p>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 py-4 bg-slate-800 text-slate-400 font-black rounded-2xl uppercase text-[10px]">Cancelar</button>
              <button onClick={executeDeletion} disabled={isDeleting} className="flex-1 py-4 bg-red-600 text-white font-black rounded-2xl uppercase text-[10px] shadow-xl flex items-center justify-center gap-2">
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;