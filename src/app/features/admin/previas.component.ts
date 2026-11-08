import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RifasService } from '../../core/services/rifas.service';
import { BannerService } from '../../core/services/banner.service';
import { Rifa } from '../../core/models/rifa.models';

/**
 * Exportação das prévias de compartilhamento.
 *
 * O WhatsApp não executa JavaScript: para mostrar o banner da rifa na prévia
 * do link é preciso um HTML estático com as metas Open Graph + a imagem como
 * arquivo. Esta tela monta o `rifas-og.json` (com o banner em base64) e o
 * disponibiliza para download; o build (`npm run deploy`) converte em
 * `r/<id>/index.html` + `r/<id>/banner.jpg`.
 */
@Component({
  selector: 'app-previas',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="pagina-titulo">
      <div>
        <a routerLink="/admin" class="texto-pequeno">← Painel</a>
        <h1 style="margin-top:4px">Prévias de compartilhamento</h1>
        <p class="sub">
          Gera o arquivo com o banner de cada rifa para o link aparecer bonito no WhatsApp.
        </p>
      </div>
      <button class="btn" [disabled]="gerando()" (click)="exportar()">
        {{ gerando() ? 'Gerando…' : '⬇️ Baixar rifas-og.json' }}
      </button>
    </div>

    <div class="aviso info">
      <b>Como funciona:</b> o WhatsApp lê apenas as metas <code>og:*</code> do HTML — não executa
      JavaScript. Por isso o link divulgado é <code>/r/&lt;id&gt;</code>, uma página estática com o
      banner da rifa, que redireciona para a rifa. O arquivo baixado aqui é consumido por
      <code>scripts/gerar-og.py</code> no deploy.
    </div>

    @if (mensagem()) { <div class="aviso" [class]="mensagemTipo()">{{ mensagem() }}</div> }

    @if (!rifas().length) {
      <div class="card vazio"><p>Nenhuma rifa para exportar.</p></div>
    } @else {
      <div class="card">
        <div class="card-titulo">
          <h2>Links prontos para divulgar</h2>
          <div class="dir"><span class="texto-pequeno">{{ rifas().length }} rifa(s)</span></div>
        </div>

        <div class="tabela-wrap">
          <table class="tabela">
            <thead>
              <tr>
                <th>Prévia</th>
                <th>Rifa</th>
                <th>Link para divulgar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rifas(); track r.id) {
                <tr>
                  <td style="width:150px">
                    <img [src]="bannerDe(r)" alt="" style="width:140px;border-radius:6px;display:block" />
                  </td>
                  <td>
                    <div style="font-weight:600">{{ r.titulo }}</div>
                    <div class="texto-pequeno">{{ r.descricao || 'sem descrição' }}</div>
                  </td>
                  <td>
                    <code style="font-size:.8rem;word-break:break-all">{{ link(r) }}</code>
                  </td>
                  <td>
                    <div class="acoes-linha">
                      <button class="btn pequeno secundario" (click)="copiar(r)">Copiar</button>
                      <a class="btn pequeno sucesso" [href]="linkWhats(r)" target="_blank" rel="noopener">💬</a>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class PreviasComponent implements OnInit {
  private readonly service = inject(RifasService);
  private readonly banners = inject(BannerService);

  readonly rifas = signal<Rifa[]>([]);
  readonly gerando = signal(false);
  readonly mensagem = signal('');
  readonly mensagemTipo = signal('aviso sucesso');

  private cache = new Map<string, string>();

  async ngOnInit(): Promise<void> {
    this.rifas.set(await this.service.listarRifas());
  }

  bannerDe(r: Rifa): string {
    if (r.banner) return r.banner;
    const c = this.cache.get(r.id);
    if (c) return c;
    const img = this.banners.gerar(
      r.titulo,
      (r.descricao ?? '').slice(0, 90),
      r.premios?.[0]?.descricao ?? '',
      r.totalNumeros,
    );
    this.cache.set(r.id, img);
    return img;
  }

  link(r: Rifa): string {
    return `${location.origin}/r/${r.id}`;
  }

  linkWhats(r: Rifa): string {
    const texto = `🎟️ ${r.titulo}\n\nReserve seu número e participe!\n${this.link(r)}`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }

  copiar(r: Rifa): void {
    navigator.clipboard?.writeText(this.link(r));
    this.mensagem.set('Link copiado.');
    this.mensagemTipo.set('aviso info');
    setTimeout(() => this.mensagem.set(''), 3000);
  }

  /** Monta o JSON com banner + dados de cada rifa e baixa. */
  exportar(): void {
    this.gerando.set(true);
    try {
      const dados = this.rifas().map((r) => ({
        id: r.id,
        titulo: r.titulo,
        descricao: r.descricao ?? '',
        imagem: this.bannerDe(r),
        url: this.link(r),
      }));

      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rifas-og.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);

      this.mensagem.set(
        'Arquivo rifas-og.json baixado. Salve na raiz do projeto e rode o deploy para publicar as prévias.',
      );
      this.mensagemTipo.set('aviso sucesso');
    } finally {
      this.gerando.set(false);
    }
  }
}
