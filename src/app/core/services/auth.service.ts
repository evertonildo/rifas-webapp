import { Injectable, inject, signal, computed } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, User as FbUser,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { ModoAppService } from './modo-app.service';
import { Usuario, ehAdministrador } from '../models/rifa.models';

/**
 * Autenticação: só administradores fazem login (Firebase Auth email/senha).
 * O participante NÃO faz login — reserva números anonimamente.
 * O perfil vem do documento em `usuarios/{uid}`; sem documento → USER (sem acesso).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly fb = inject(FirebaseService);
  private readonly router = inject(Router);
  private readonly modo = inject(ModoAppService);

  private readonly _usuario = signal<Usuario | null>(null);
  readonly usuario = this._usuario.asReadonly();
  readonly logado = computed(() => this._usuario() !== null);
  readonly administrador = computed(() => ehAdministrador(this._usuario()?.perfil));
  readonly sysop = computed(() => this._usuario()?.perfil === 'SYSOP');
  readonly carregando = signal(true);

  /** Resolvida no primeiro evento de auth — guards esperam por ela. */
  readonly pronto: Promise<void>;
  private resolverPronto!: () => void;

  constructor() {
    this.pronto = new Promise<void>((res) => (this.resolverPronto = res));

    // Modo demonstração: não usa Firebase Auth (não há projeto configurado).
    if (this.modo.demo) {
      try {
        const bruto = sessionStorage.getItem('rifas:demo-admin');
        if (bruto) this._usuario.set(JSON.parse(bruto) as Usuario);
      } catch { /* ignora */ }
      this.carregando.set(false);
      this.resolverPronto();
      return;
    }

    onAuthStateChanged(this.fb.auth, async (fbUser: FbUser | null) => {
      if (fbUser?.email) {
        try {
          const u = await this.fb.garantirUsuario({
            uid: fbUser.uid,
            nome: fbUser.displayName ?? fbUser.email.split('@')[0],
            email: fbUser.email,
          });
          this._usuario.set(u);
        } catch {
          this._usuario.set(null);
        }
      } else {
        this._usuario.set(null);
      }
      this.carregando.set(false);
      this.resolverPronto();
    });
  }

  async entrar(email: string, senha: string): Promise<void> {
    if (this.modo.demo) {
      // Demonstração: qualquer e-mail/senha entra como administrador.
      if (!email.trim() || !senha) throw new Error('Informe e-mail e senha.');
      // Na demonstração: e-mails cadastrados em Administradores entram com o
      // próprio perfil (para testar o escopo); qualquer outro entra como SYSOP.
      const informado = email.trim().toLowerCase();
      let usuario: Usuario | null = null;
      try {
        const lista = JSON.parse(localStorage.getItem('rifas:demo:admins') || '[]') as Usuario[];
        usuario = lista.find((u) => u.email.toLowerCase() === informado) ?? null;
      } catch { /* ignora */ }

      if (!usuario) {
        usuario = {
          id: 'demo-admin',
          nome: 'SysOp (demonstração)',
          email: informado,
          telefone: '11999990000',
          perfil: 'SYSOP',
          cotaNumeros: null,
        };
      }
      try { sessionStorage.setItem('rifas:demo-admin', JSON.stringify(usuario)); } catch { /* ignora */ }
      this._usuario.set(usuario);
      return;
    }
    await signInWithEmailAndPassword(this.fb.auth, email.trim(), senha);
  }

  async sair(): Promise<void> {
    if (this.modo.demo) {
      try { sessionStorage.removeItem('rifas:demo-admin'); } catch { /* ignora */ }
      this._usuario.set(null);
      this.router.navigate(['/']);
      return;
    }
    await signOut(this.fb.auth);
    this.router.navigate(['/']);
  }

  /** Erros do Firebase Auth traduzidos para o usuário. */
  static mensagemErro(codigo: string | undefined): string {
    switch (codigo) {
      case 'auth/invalid-email':
        return 'E-mail inválido.';
      case 'auth/user-disabled':
        return 'Esta conta está desativada.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'E-mail ou senha incorretos.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
      case 'auth/network-request-failed':
        return 'Falha de conexão. Verifique sua internet.';
      default:
        return 'Não foi possível entrar. Verifique os dados e tente novamente.';
    }
  }
}

/** Guard das rotas administrativas: exige perfil ADMIN/SYSOP/OPERATOR. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.pronto;
  if (auth.administrador()) return true;
  router.navigate(['/login']);
  return false;
};

/**
 * Guard exclusivo do SysOp (cadastro de administradores).
 * Quem não é SysOp volta ao painel — nunca vê a tela.
 */
export const sysopGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.pronto;
  if (auth.sysop()) return true;
  router.navigate(['/admin']);
  return false;
};
