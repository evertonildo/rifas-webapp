import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { InstalacaoService } from './core/services/instalacao.service';
import { PERFIL_LABEL } from './core/models/rifa.models';
import { BannerInstalarComponent } from './shared/banner-instalar.component';
import { AvisoDemoComponent } from './shared/aviso-demo.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BannerInstalarComponent, AvisoDemoComponent],
  template: `
    <header class="app-header">
      <a class="logo" routerLink="/">
        <span class="emoji">🎟️</span>
        <span>Rifas <span class="marca">Audita</span></span>
      </a>
      <nav class="menu">
        <a routerLink="/" routerLinkActive="ativo" [routerLinkActiveOptions]="{ exact: true }">Rifas</a>
        @if (auth.administrador()) {
          <a routerLink="/admin" routerLinkActive="ativo">Painel</a>
          <a routerLink="/admin/dashboard" routerLinkActive="ativo">Dashboard</a>
          <a routerLink="/admin/previas" routerLinkActive="ativo">Divulgação</a>
        }
        @if (auth.sysop()) {
          <a routerLink="/admin/admins" routerLinkActive="ativo">Administradores</a>
        }
      </nav>
      <div class="spacer"></div>
      <div class="usuario">
        @if (auth.carregando()) {
          <span class="texto-pequeno" style="color:#94a3b8">…</span>
        } @else if (auth.usuario(); as u) {
          <span>{{ u.nome }}</span>
          <span class="badge badge-roxo">{{ PERFIL_LABEL[u.perfil] }}</span>
          <button class="header-btn sair" (click)="auth.sair()">Sair</button>
        } @else {
          <a class="header-btn" routerLink="/login">Login do administrador</a>
        }
      </div>
    </header>

    <main class="app-main">
      <app-aviso-demo />
      <app-banner-instalar />
      <router-outlet />
    </main>
  `,
})
export class AppComponent {
  readonly PERFIL_LABEL = PERFIL_LABEL;
  constructor(
    readonly auth: AuthService,
    readonly instalacao: InstalacaoService,
  ) {}
}
