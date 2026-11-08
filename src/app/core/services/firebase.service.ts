import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore, Firestore, collection, doc, getDoc, getDocs,
  query, where, limit, setDoc, updateDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { Usuario } from '../models/rifa.models';

/**
 * Conexão única com o Firebase do projeto.
 *
 * O documento do usuário usa o UID do Firebase Auth como id quando disponível
 * (`usuarios/{uid}`), o que permite às regras do Firestore validarem se quem
 * confirma pagamento é realmente administrador.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private _app: FirebaseApp | null = null;
  private _db: Firestore | null = null;
  private _auth: Auth | null = null;

  get app(): FirebaseApp {
    if (!this._app) {
      this._app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
    }
    return this._app;
  }

  get db(): Firestore {
    if (!this._db) this._db = getFirestore(this.app);
    return this._db;
  }

  get auth(): Auth {
    if (!this._auth) this._auth = getAuth(this.app);
    return this._auth;
  }

  /**
   * Garante o documento em `usuarios`: procura por email; se não existir,
   * cria (perfil USER por padrão). Quando recebe o uid do Firebase Auth, usa
   * esse uid como id do documento.
   */
  async garantirUsuario(dados: {
    uid?: string;
    nome: string;
    email: string;
    perfil?: Usuario['perfil'];
  }): Promise<Usuario> {
    const email = dados.email.trim().toLowerCase();

    if (dados.uid) {
      const ref = doc(this.db, 'usuarios', dados.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const existente = { id: snap.id, ...(snap.data() as object) } as Usuario;
        if (dados.nome && existente.nome !== dados.nome) {
          await updateDoc(ref, { nome: dados.nome, updated_at: serverTimestamp() });
          existente.nome = dados.nome;
        }
        return existente;
      }
    }

    const q = query(collection(this.db, 'usuarios'), where('email', '==', email), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      const existente = { id: d.id, ...(d.data() as object) } as Usuario;
      // Documento antigo sem uid: mantém o id original (as regras aceitam ambos).
      return existente;
    }

    const novo = {
      nome: dados.nome || email.split('@')[0],
      email,
      perfil: (dados.perfil ?? 'USER') as Usuario['perfil'],
      ativo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
    const ref = dados.uid ? doc(this.db, 'usuarios', dados.uid) : doc(collection(this.db, 'usuarios'));
    await setDoc(ref, novo);
    return {
      id: ref.id,
      ...novo,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /** Converte Timestamp do Firestore para ISO string, quando aplicável. */
  static paraIso(v: unknown): string | undefined {
    if (!v) return undefined;
    if (v instanceof Timestamp) return v.toDate().toISOString();
    if (typeof v === 'string') return v;
    if (v instanceof Date) return v.toISOString();
    return undefined;
  }
}
