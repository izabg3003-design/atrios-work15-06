import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  getDocs,
  getDoc
} from 'firebase/firestore';
import { db } from './firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null
    },
    operationType,
    path
  };
  console.error('Firestore Fallback Error: ', JSON.stringify(errInfo));
  return error;
}

export interface FallbackTicket {
  id: string;
  user_id: string;
  status: 'open' | 'resolved';
  last_message: string;
  updated_at: string;
  user_name: string;
  user_email: string;
}

export interface FallbackMessage {
  id: string;
  user_id: string;
  text: string;
  sender_role: 'user' | 'support' | 'ai';
  created_at: string;
}

// 1. Salvar ou atualizar ticket de suporte no Firestore
export async function saveFallbackTicket(
  userId: string, 
  status: 'open' | 'resolved', 
  lastMessage: string, 
  userName: string, 
  userEmail: string
) {
  if (!db) return;
  const path = `support_tickets/${userId}`;
  try {
    const docRef = doc(db, 'support_tickets', userId);
    const updatedAtStr = new Date().toISOString();
    
    await setDoc(docRef, {
      id: userId,
      user_id: userId,
      status,
      last_message: lastMessage,
      updated_at: updatedAtStr,
      user_name: userName || 'Visitante/Utilizador',
      user_email: userEmail || '',
    }, { merge: true });
    
    console.log(`[Firestore Fallback] Ticket guardado com sucesso: ${userId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// 2. Salvar mensagem no subcoleção do ticket
export async function saveFallbackMessage(
  userId: string, 
  text: string, 
  senderRole: 'user' | 'support' | 'ai'
) {
  if (!db) return;
  const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  const path = `support_tickets/${userId}/messages/${msgId}`;
  try {
    const docRef = doc(db, 'support_tickets', userId, 'messages', msgId);
    const createdAtStr = new Date().toISOString();
    
    await setDoc(docRef, {
      id: msgId,
      user_id: userId,
      text,
      sender_role: senderRole,
      created_at: createdAtStr
    });
    
    // Atualizar também o last_message e updated_at no ticket pai de forma integrada
    const ticketRef = doc(db, 'support_tickets', userId);
    await updateDoc(ticketRef, {
      last_message: text,
      updated_at: createdAtStr
    }).catch(() => {
      // Se o ticket pai não existir ainda, criamos de forma simplificada
      setDoc(ticketRef, {
        id: userId,
        user_id: userId,
        status: 'open',
        last_message: text,
        updated_at: createdAtStr,
        user_name: 'Visitante/Utilizador',
        user_email: ''
      }, { merge: true });
    });

    console.log(`[Firestore Fallback] Mensagem guardada com sucesso no Firestore: ${msgId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// 3. Resolver ticket no Firestore
export async function resolveFallbackTicket(userId: string) {
  if (!db) return;
  const path = `support_tickets/${userId}`;
  try {
    const docRef = doc(db, 'support_tickets', userId);
    const updatedAtStr = new Date().toISOString();
    
    await updateDoc(docRef, {
      status: 'resolved',
      updated_at: updatedAtStr
    });
    
    console.log(`[Firestore Fallback] Ticket resolvido com sucesso no Firestore: ${userId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// 4. Obter todos os tickets do Firestore (Array estático)
export async function getFallbackTickets(): Promise<FallbackTicket[]> {
  if (!db) return [];
  const path = 'support_tickets';
  try {
    const querySnapshot = await getDocs(collection(db, 'support_tickets'));
    const tickets: FallbackTicket[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      tickets.push({
        id: doc.id,
        user_id: data.user_id || doc.id,
        status: data.status || 'open',
        last_message: data.last_message || '',
        updated_at: data.updated_at || new Date().toISOString(),
        user_name: data.user_name || 'Utilizador',
        user_email: data.user_email || ''
      });
    });
    return tickets;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

// 5. Obter mensagens de um ticket do Firestore (Array estático)
export async function getFallbackMessages(userId: string): Promise<FallbackMessage[]> {
  if (!db) return [];
  const path = `support_tickets/${userId}/messages`;
  try {
    const q = query(collection(db, 'support_tickets', userId, 'messages'), orderBy('created_at', 'asc'));
    const querySnapshot = await getDocs(q);
    const messages: FallbackMessage[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        user_id: userId,
        text: data.text || '',
        sender_role: data.sender_role || 'user',
        created_at: data.created_at || new Date().toISOString()
      });
    });
    return messages;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

// 6. Listener em tempo real para todos os tickets do Firestore (Ideal para o painel Master)
export function listenToFallbackTickets(onUpdate: (tickets: FallbackTicket[]) => void) {
  if (!db) return () => {};
  const path = 'support_tickets';
  return onSnapshot(collection(db, 'support_tickets'), (snapshot) => {
    const tickets: FallbackTicket[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      tickets.push({
        id: doc.id,
        user_id: data.user_id || doc.id,
        status: data.status || 'open',
        last_message: data.last_message || '',
        updated_at: data.updated_at || new Date().toISOString(),
        user_name: data.user_name || 'Utilizador',
        user_email: data.user_email || ''
      });
    });
    onUpdate(tickets);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
}

// 7. Listener em tempo real para as mensagens de um ticket (Ideal para o chat ativo do Master ou do User)
export function listenToFallbackMessages(userId: string, onUpdate: (messages: FallbackMessage[]) => void) {
  if (!db) return () => {};
  const path = `support_tickets/${userId}/messages`;
  const q = query(collection(db, 'support_tickets', userId, 'messages'), orderBy('created_at', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const messages: FallbackMessage[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        user_id: userId,
        text: data.text || '',
        sender_role: data.sender_role || 'user',
        created_at: data.created_at || new Date().toISOString()
      });
    });
    onUpdate(messages);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
  });
}
