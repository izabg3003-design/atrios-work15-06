export interface PushParams {
  title: string;
  body: string;
  audience?: string;
  url?: string;
  targetUserId?: string;
  targetUserEmail?: string;
}

/**
 * Envia uma notificação push de forma robusta e unificada.
 * Dispara primeiramente para a API Express local (/api/send-fcm-push), que gerencia os envios
 * via Firebase Admin (FCM v1) e Web Push (VAPID) para dispositivos em background,
 * garantindo o recebimento mesmo com o telemóvel bloqueado ou a aplicação fechada.
 */
export async function sendPushNotification(params: PushParams): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/send-fcm-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      keepalive: true,
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        audience: params.audience,
        url: params.url || '/',
        targetUserId: params.targetUserId,
        targetUserEmail: params.targetUserEmail,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const responseText = await response.text();
    let data: any = null;
    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.warn('[Push Sender] Resposta não é um JSON válido:', responseText);
      }
    }

    console.log('[Push Sender] Notificação despachada com sucesso pela API do Servidor:', data || '(corpo vazio)');
    return { success: true };
  } catch (err: any) {
    console.error('[Push Sender] Erro ao enviar push via API local do Servidor, usando fallback:', err);
    return { success: false, error: err.message || String(err) };
  }
}
