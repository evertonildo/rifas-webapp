import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ModoAppService } from '../../core/services/modo-app.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div style="max-width:420px;margin:40px auto">
      <div class="card">
        <div class="texto-centro mb">
          <div style="font-size:2.2rem">🎟️</div>
          <h1 style="font-size:1.3rem;margin-top:6px">Área do administrador</h1>
          <p class="texto-pequeno" style="margin:0">
            Entre com a conta de administrador para gerenciar as rifas.
          </p>
        </div>

        @if (modo.demo) {
          <div class="aviso atencao">
            <b>Modo demonstração:</b> entre com qualquer e-mail e senha para explorar o painel.
          </div>
        }
        @if (erro()) { <div class="aviso erro">{{ erro() }}</div> }

        <form (ngSubmit)="entrar()">
          <div class="campo">
            <label for="email">E-mail</label>
            <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="username" placeholder="admin@email.com" />
          </div>
          <div class="campo">
            <label for="senha">Senha</label>
            <input id="senha" type="password" name="senha" [(ngModel)]="senha" required autocomplete="current-password" placeholder="Sua senha" />
          </div>
          <button class="btn largo" type="submit" [disabled]="carregando()">
            {{ carregando() ? 'Entrando…' : 'Entrar' }}
          </button>
        </form>

        <div class="divisor"></div>
        <a routerLink="/" class="texto-pequeno">← Voltar para as rifas</a>
      </div>

      <p class="texto-pequeno texto-centro mt">
        Não é administrador? Não precisa de login: escolha uma rifa e reserve pelo número. 🙂
      </p>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  readonly modo = inject(ModoAppService);
  private readonly router = inject(Router);

  email = '';
  senha = '';
  readonly carregando = signal(false);
  readonly erro = signal('');

  constructor() {
    // Se já está logado como admin, vai direto ao painel.
    this.auth.pronto.then(() => {
      if (this.auth.administrador()) this.router.navigate(['/admin']);
    });
  }

  async entrar(): Promise<void> {
    if (!this.email.trim() || !this.senha) {
      this.erro.set('Informe e-mail e senha.');
      return;
    }
    this.carregando.set(true);
    this.erro.set('');
    try {
      await this.auth.entrar(this.email, this.senha);
      await this.auth.pronto;
      if (this.auth.administrador()) {
        await this.router.navigate(['/admin']);
      } else {
        this.erro.set('Esta conta não tem perfil de administrador. Fale com o responsável pelo sistema.');
        await this.auth.sair();
      }
    } catch (e) {
      const codigo = (e as { code?: string })?.code;
      this.erro.set(AuthService.mensagemErro(codigo));
    } finally {
      this.carregando.set(false);
    }
  }
}
