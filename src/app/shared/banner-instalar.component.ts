import { Component, inject } from '@angular/core';
import { InstalacaoService } from '../core/services/instalacao.service';

/** Faixa que sugere instalar o webapp na tela inicial (PWA). */
@Component({
  selector: 'app-banner-instalar',
  standalone: true,
  template: `
    @if (instalacao.mostrarSugestao) {
      <div class="banner-instalar">
        <span class="ico">📲</span>
        <div class="txt">
          @if (instalacao.ios()) {
            <strong>Instale na Tela de Início</strong>
            Toque em <b>Compartilhar</b> ⬆️ e depois em <b>Adicionar à Tela de Início</b> para usar como aplicativo.
          } @else {
            <strong>Instale o app</strong>
            Adicione à tela inicial e abra em tela cheia, sem precisar de loja de aplicativos.
          }
        </div>
        @if (instalacao.podeInstalar()) {
          <button class="btn pequeno" (click)="instalacao.instalar()">Instalar aplicativo</button>
        }
        <button class="btn-fantasma" (click)="instalacao.dispensar()">Agora não</button>
      </div>
    }
  `,
})
export class BannerInstalarComponent {
  readonly instalacao = inject(InstalacaoService);
}
