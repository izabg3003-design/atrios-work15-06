/**
 * Utility to log received push notifications and system alerts in localStorage.
 * This is used to populate the "Push Recebidos" (Received Push) tab in the Admin Dashboard.
 */

export interface ReceivedPushLog {
  id: string;
  title: string;
  body: string;
  receivedAt: string;
  category: string; // 'system' | 'manual' | 'signup' | 'sale'
}

export function logReceivedPush(title: string, body: string, category: string = 'system') {
  try {
    const rawHistory = localStorage.getItem('received_pushes_history') || '[]';
    const history: ReceivedPushLog[] = JSON.parse(rawHistory);
    
    // Clean up title
    const cleanTitle = title.replace('[PUSH]', '').replace('[push]', '').replace('[SYSTEM]', '').replace('[SYSTEM_PUSH]', '').trim();
    const cleanBody = body.trim();

    // Prevent duplicate entries within 5 seconds
    const isDuplicate = history.some(
      (h) => 
        h.title === cleanTitle && 
        h.body === cleanBody && 
        (Date.now() - new Date(h.receivedAt).getTime()) < 5000
    );

    if (isDuplicate) return;

    const newLog: ReceivedPushLog = {
      id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: cleanTitle,
      body: cleanBody,
      receivedAt: new Date().toISOString(),
      category
    };

    history.unshift(newLog);

    // Keep history bounded to 100 items
    if (history.length > 100) {
      history.pop();
    }

    localStorage.setItem('received_pushes_history', JSON.stringify(history));
    
    // Dispatch custom event to notify open tabs/views
    window.dispatchEvent(new Event('received_pushes_updated'));
  } catch (err) {
    console.warn('[PushLogger] Error saving received push to localStorage:', err);
  }
}
