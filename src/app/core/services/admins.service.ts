import { Injectable, inject } from '@angular/core';
import {
  collection, doc, getDoc, getDocs, query, where, limit, setDoc, updateDoc,
  deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail,
  signOut as fbSignOut,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { ModoAppService } from './modo-app.service';
import { AuthService } from './auth.service';
import { Usuario, Perfil, blocosParaNumeros, BLOCO_NUMEROS } from '../models/rifa.models';
import { environment } from '../../../environments/environment';

export interface NovoAdmin {
  nome: string;
  email: string;
  telefone: string;
  /** Quantidade de blocos de 100 números liberados. */
  blocos: number;
  perfil: Perfil;
  senhaInicial: string;
}

/** Resumo de uso da cota de um administrador. */
export interface UsoCota {
  cotaNumeros: number | null;
  usado: number;
  disponivel: number | null;
  percentual: number;
  rifas: number;
}

/**
 * Gestão de administradores (somente SYSOP).
 *
 * A conta é criada no Firebase Authentication por um **app secundário**
 * inicializado na hora: assim o SysOp continua logado no app principal.
 * O documento `usuarios/{uid}` recebe nome, e-mail, telefone e a cota
 * (em números, calculada a partir dos blocos de 100).
 */
@Injectable({ providedIn: 'root' })
export class AdminsService {
  private readonly fb = inject(FirebaseService);
  private readonly auth = inject(AuthService);
  private readonly modo = inject(ModoAppService);

  private readonly CHAVE_DEMO = 'rifas:demo:admins';

  // ==================== LISTAGEM ====================

  async listar(): Promise<Usuario[]> {
    if (this.modo.demo) return this.listarDemo();

    const snap = await getDocs(collection(this.fb.db, 'usuarios'));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) } as Usuario))
      .filter((u) => u.perfil !== 'USER')
      .sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? ''));
  }

  async obter(uid: string): Promise<Usuario | null> {
    if (this.modo.demo) {
      return this.listarDemo().find((u) => u.id === uid) ?? null;
    }
    const snap = await getDoc(doc(this.fb.db, 'usuarios', uid));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as Usuario) : null;
  }

  // ==================== CRIAÇÃO ====================

  /**
   * Cria a conta e o documento do administrador.
   * Usa um app Firebase secundário para não derrubar a sessão do SysOp.
   */
  async criar(novo: NovoAdmin): Promise<Usuario> {
    const email = novo.email.trim().toLowerCase();
    const cotaNumeros = blocosParaNumeros(novo.blocos);

    if (cotaNumeros <= 0) throw new Error('Libere pelo menos 1 bloco de 100 números.');
    if (!novo.nome.trim()) throw new Error('Informe o nome do administrador.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
    if (novo.telefone.replace(/\D/g, '').length < 10) throw new Error('Telefone com DDD é obrigatório.');
    if ((novo.senhaInicial ?? '').length < 6) throw new Error('A senha inicial precisa ter ao menos 6 caracteres.');

    if (this.modo.demo) return this.criarDemo(novo, cotaNumeros);

    // Já existe um documento com este e-mail?
    const existente = await getDocs(
      query(collection(this.fb.db, 'usuarios'), where('email', '==', email), limit(1)),
    );
    if (!existente.empty) {
      const u = { id: existente.docs[0].id, ...(existente.docs[0].data() as object) } as Usuario;
      if (u.perfil !== 'USER') throw new Error('Já existe um administrador com este e-mail.');
    }

    const secundario: FirebaseApp = initializeApp(environment.firebase, `criador-${Date.now()}`);
    let uid = '';
    try {
      const authSec = getAuth(secundario);
      const cred = await createUserWithEmailAndPassword(authSec, email, novo.senhaInicial);
      uid = cred.user.uid;
      await fbSignOut(authSec);
    } catch (e) {
      const codigo = (e as { code?: string })?.code ?? '';
      if (codigo === 'auth/email-already-in-use') {
        throw new Error('Este e-mail já tem conta no Firebase Authentication. Use outro e-mail ou redefina a senha.');
      }
      if (codigo === 'auth/weak-password') throw new Error('Senha fraca: use ao menos 6 caracteres.');
      if (codigo === 'auth/invalid-email') throw new Error('E-mail inválido.');
      throw new Error('Não foi possível criar a conta no Firebase Authentication.');
    } finally {
      await deleteApp(secundario).catch(() => undefined);
    }

    const atual = this.auth.usuario();
    const dados = {
      nome: novo.nome.trim(),
      email,
      telefone: novo.telefone.trim(),
      perfil: novo.perfil,
      ativo: true,
      cotaNumeros,
      cotaUsada: 0,
      criado_por: atual?.nome ?? 'SysOp',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };

    await setDoc(doc(this.fb.db, 'usuarios', uid), dados);
    return { id: uid, ...dados } as unknown as Usuario;
  }

  // ==================== EDIÇÃO ====================

  async atualizar(uid: string, dados: Partial<Usuario> & { blocos?: number }): Promise<void> {
    if (this.modo.demo) {
      const lista = this.listarDemo();
      const alvo = lista.find((u) => u.id === uid);
      if (!alvo) throw new Error('Administrador não encontrado.');
      Object.assign(alvo, {
        nome: dados.nome ?? alvo.nome,
        telefone: dados.telefone ?? alvo.telefone,
        perfil: dados.perfil ?? alvo.perfil,
        ativo: dados.ativo ?? alvo.ativo,
        cotaNumeros:
          dados.blocos !== undefined ? blocosParaNumeros(dados.blocos) : (dados.cotaNumeros ?? alvo.cotaNumeros),
      });
      this.salvarDemo(lista);
      return;
    }

    const payload: Record<string, unknown> = { updated_at: serverTimestamp() };
    if (dados.nome !== undefined) payload['nome'] = dados.nome.trim();
    if (dados.telefone !== undefined) payload['telefone'] = dados.telefone.trim();
    if (dados.perfil !== undefined) payload['perfil'] = dados.perfil;
    if (dados.ativo !== undefined) payload['ativo'] = dados.ativo;
    if (dados.blocos !== undefined) payload['cotaNumeros'] = blocosParaNumeros(dados.blocos);
    else if (dados.cotaNumeros !== undefined) payload['cotaNumeros'] = dados.cotaNumeros;

    await updateDoc(doc(this.fb.db, 'usuarios', uid), payload);
  }

  async excluir(uid: string): Promise<void> {
    if (this.modo.demo) {
      this.salvarDemo(this.listarDemo().filter((u) => u.id !== uid));
      return;
    }
    // O documento sai; a conta de Authentication precisa ser removida no Console
    // (o SDK do cliente não apaga usuários de terceiros).
    await deleteDoc(doc(this.fb.db, 'usuarios', uid));
  }

  /** Envia e-mail de redefinição de senha (Firebase Auth). */
  async enviarRedefinicaoSenha(email: string): Promise<void> {
    if (this.modo.demo) return;
    await sendPasswordResetEmail(this.fb.auth, email.trim().toLowerCase());
  }

  // ==================== COTA ====================

  /**
   * Calcula o uso da cota a partir das rifas do administrador.
   * Cada rifa consome `totalNumeros`; excluir uma rifa devolve a cota.
   */
  async usoCota(usuario: Usuario, rifasDoAdmin: Array<{ totalNumeros: number }>): Promise<UsoCota> {
    const cota = usuario.cotaNumeros ?? null;
    const usado = rifasDoAdmin.reduce((s, r) => s + (r.totalNumeros || 0), 0);
    const disponivel = cota === null ? null : Math.max(0, cota - usado);
    return {
      cotaNumeros: cota,
      usado,
      disponivel,
      percentual: cota ? Math.min(100, Math.round((usado / cota) * 100)) : 0,
      rifas: rifasDoAdmin.length,
    };
  }

  /** Converte a quantidade de números na quantidade de blocos (para exibir). */
  blocosDe(numeros: number | null | undefined): number {
    if (numeros === null || numeros === undefined) return 0;
    return Math.floor(numeros / BLOCO_NUMEROS);
  }

  // ==================== DEMONSTRAÇÃO ====================

  private listarDemo(): Usuario[] {
    try {
      const bruto = localStorage.getItem(this.CHAVE_DEMO);
      if (bruto) return JSON.parse(bruto) as Usuario[];
    } catch { /* ignora */ }
    const iniciais: Usuario[] = [
      {
        id: 'demo-admin',
        nome: 'Administrador (demonstração)',
        email: 'admin@rifas.app',
        telefone: '11999990000',
        perfil: 'SYSOP',
        ativo: true,
        cotaNumeros: null,
      },
      {
        id: 'demo-admin-2',
        nome: 'Carla Mendes',
        email: 'carla@rifas.app',
        telefone: '21988887777',
        perfil: 'ADMIN',
        ativo: true,
        cotaNumeros: 200,
      },
    ];
    this.salvarDemo(iniciais);
    return iniciais;
  }

  private salvarDemo(lista: Usuario[]): void {
    try { localStorage.setItem(this.CHAVE_DEMO, JSON.stringify(lista)); } catch { /* ignora */ }
  }

  private criarDemo(novo: NovoAdmin, cotaNumeros: number): Usuario {
    const lista = this.listarDemo();
    if (lista.some((u) => u.email.toLowerCase() === novo.email.trim().toLowerCase())) {
      throw new Error('Já existe um administrador com este e-mail.');
    }
    const usuario: Usuario = {
      id: `demo-${Date.now()}`,
      nome: novo.nome.trim(),
      email: novo.email.trim().toLowerCase(),
      telefone: novo.telefone.trim(),
      perfil: novo.perfil,
      ativo: true,
      cotaNumeros,
      cotaUsada: 0,
      criado_por: 'SysOp',
    };
    lista.push(usuario);
    this.salvarDemo(lista);
    return usuario;
  }
}
