import { DatePipe } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RifasService } from '../../core/services/rifas.service';
import { BannerService } from '../../core/services/banner.service';
import {
  Rifa, SITUACAO_RIFA_LABEL, situacaoRifa, formatarMoeda,
} from '../../core/models/rifa.models';

type Aba = 'vigentes' | 'encerradas';

/** Vitrine pública: banner por rifa, abas vigentes/encerradas e busca. */
@Component({
  selector: 'app-rifas-list',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe],
  template: `
    <div class="pagina-titulo">
      <div>
        <h1>Rifas disponíveis</h1>
        <p class="sub">Escolha uma rifa, reserve seus números e envie o comprovante de pagamento.</p>
      </div>
      <input
        style="max-width:280px;width:100%;padding:10px 12px;border:1px solid var(--cinza-300);border-radius:9px;font-size:.92rem"
        placeholder="🔍 Buscar rifa…"
        [(ngModel)]="busca"
      />
    </div>

    <div class="abas">
      <button class="aba" [class.ativa]="aba() === 'vigentes'" (click)="aba.set('vigentes')">
        Em andamento
        <span class="contagem">{{ vigentes().length }}</span>
      </button>
      <button class="aba" [class.ativa]="aba() === 'encerradas'" (click)="aba.set('encerradas')">
        Encerradas
        <span class="contagem">{{ encerradas().length }}</span>
      </button>
    </div>

    @if (carregando()) {
      <div class="carregando"><div class="spinner"></div>Carregando rifas…</div>
    } @else if (!lista().length) {
      <div class="card vazio">
        <div class="icone">🎟️</div>
        <p>Nenhuma rifa {{ aba() === 'vigentes' ? 'em andamento' : 'encerrada' }} encontrada.</p>
        <p class="texto-pequeno">Assim que uma rifa estiver disponível, ela aparece aqui.</p>
      </div>
    } @else {
      <div class="grade-rifas">
        @for (rifa of lista(); track rifa.id) {
          <a class="rifa-card-banner" [routerLink]="['/rifa', rifa.id]">
            <div class="banner-wrap">
              <img [src]="bannerDe(rifa)" [alt]="rifa.titulo" loading="lazy" />
              <span class="badge selo" [class]="classeSituacao(rifa)">{{ rotuloSituacao(rifa) }}</span>
            </div>
            <div class="conteudo">
              <h2>{{ rifa.titulo }}</h2>
              @if (rifa.descricao) {
                <p class="descricao">{{ rifa.descricao }}</p>
              }
              <div class="meta">
                <span>🔢 {{ rifa.totalNumeros }} números</span>
                @if (rifa.valorNumero) {
                  <span>💰 {{ formatarMoeda(rifa.valorNumero) }}</span>
                }
                @if (rifa.dataSorteio) {
                  <span>📅 {{ rifa.dataSorteio | date: 'dd/MM/yyyy' }}</span>
                }
              </div>
              <div class="progresso">
                <div class="barra-fundo">
                  <div class="barra-preenchida verde" [style.width.%]="percentualPago(rifa)"></div>
                </div>
                <div class="barra-info">
                  <span>{{ rifa.totalNumerosPagos ?? 0 }} pagos · {{ percentualPago(rifa) }}%</span>
                  @if (rifa.numero_sorteado) {
                    <span class="sorteado">🎉 Nº {{ pad(rifa.numero_sorteado) }}</span>
                  }
                </div>
              </div>
            </div>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .abas { display: flex; gap: 6px; margin-bottom: 18px; border-bottom: 1px solid var(--cinza-200); }
    .aba {
      background: none; border: none; border-bottom: 3px solid transparent; cursor: pointer;
      padding: 10px 16px; font-size: .95rem; font-weight: 600; color: var(--cinza-500);
      font-family: inherit; display: flex; align-items: center; gap: 8px;
    }
    .aba:hover { color: var(--cinza-900); }
    .aba.ativa { color: var(--azul); border-bottom-color: var(--azul); }
    .contagem {
      background: var(--cinza-200); color: var(--cinza-700); border-radius: 999px;
      padding: 1px 8px; font-size: .76rem; font-weight: 700;
    }
    .aba.ativa .contagem { background: #dbeafe; color: #1e40af; }

    .grade-rifas { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); }
    .rifa-card-banner {
      display: flex; flex-direction: column; background: #fff; border: 1px solid var(--cinza-200);
      border-radius: var(--raio); overflow: hidden; box-shadow: var(--sombra);
      text-decoration: none; color: inherit; transition: box-shadow .15s, transform .15s;
    }
    .rifa-card-banner:hover { box-shadow: var(--sombra-alta); transform: translateY(-3px); text-decoration: none; }
    .banner-wrap { position: relative; aspect-ratio: 1200 / 630; background: #0f172a; overflow: hidden; }
    .banner-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .selo { position: absolute; top: 10px; right: 10px; }
    .conteudo { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .conteudo h2 { font-size: 1.05rem; margin: 0; }
    .descricao {
      margin: 0; font-size: .86rem; color: var(--cinza-500); line-height: 1.45;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: .8rem; color: var(--cinza-500); }
    .progresso { margin-top: auto; }
    .sorteado { color: #6d28d9; font-weight: 700; }
  `],
})
export class RifasListComponent implements OnInit, OnDestroy {
  private readonly service = inject(RifasService);
  private readonly banners = inject(BannerService);

  readonly rifas = signal<Rifa[]>([]);
  readonly carregando = signal(true);
  readonly aba = signal<Aba>('vigentes');
  busca = '';

  private cacheBanners = new Map<string, string>();

  private readonly filtradas = computed(() => {
    const termo = this.busca.trim().toLowerCase();
    if (!termo) return this.rifas();
    return this.rifas().filter(
      (r) => r.titulo.toLowerCase().includes(termo) || (r.descricao ?? '').toLowerCase().includes(termo),
    );
  });

  readonly vigentes = computed(() => this.filtradas().filter((r) => !r.encerrada && !r.sorteada));
  readonly encerradas = computed(() => this.filtradas().filter((r) => r.encerrada || r.sorteada));
  readonly lista = computed(() => (this.aba() === 'vigentes' ? this.vigentes() : this.encerradas()));

  private parar: (() => void) | null = null;

  ngOnInit(): void {
    this.parar = this.service.observarRifas((rifas) => {
      this.rifas.set(rifas);
      this.carregando.set(false);
    });
    setTimeout(() => this.carregando.set(false), 8000);
  }

  ngOnDestroy(): void {
    this.parar?.();
  }

  /** Banner da rifa: o enviado pelo admin ou um gerado automaticamente. */
  bannerDe(rifa: Rifa): string {
    if (rifa.banner) return rifa.banner;
    const emCache = this.cacheBanners.get(rifa.id);
    if (emCache) return emCache;

    const premio = rifa.premios?.length ? rifa.premios[0].descricao : '';
    const img = this.banners.gerar(
      rifa.titulo,
      (rifa.descricao ?? '').slice(0, 90),
      premio,
      rifa.totalNumeros,
    );
    this.cacheBanners.set(rifa.id, img);
    return img;
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  rotuloSituacao(r: Rifa): string {
    return SITUACAO_RIFA_LABEL[situacaoRifa(r)];
  }

  classeSituacao(r: Rifa): string {
    const s = situacaoRifa(r);
    if (s === 'sorteada') return 'badge badge-roxo';
    if (s === 'encerrada') return 'badge badge-cinza';
    return 'badge badge-verde';
  }

  percentualPago(r: Rifa): number {
    if (!r.totalNumeros) return 0;
    return Math.round(((r.totalNumerosPagos ?? 0) / r.totalNumeros) * 100);
  }

  protected readonly formatarMoeda = formatarMoeda;
}
