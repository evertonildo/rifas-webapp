import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RifasService } from '../../core/services/rifas.service';
import {
  Rifa, NumeroRifa, Participante, formatarMoeda, situacaoRifa,
  SITUACAO_RIFA_LABEL,
} from '../../core/models/rifa.models';

const CHAVE_PARTICIPANTE = 'rifas:ultimo-participante';

/**
 * Página pública da rifa: grade de números + formulário de reserva.
 *
 * O último participante fica salvo no navegador (localStorage) e os dados são
 * preenchidos automaticamente para quem reservar mais de uma vez.
 */
@Component({
  selector: 'app-rifa-detalhe',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    @if (carregando()) {
      <div class="carregando"><div class="spinner"></div>Carregando…</div>
    } @else if (!rifa()) {
      <div class="card vazio">
        <div class="icone">🔍</div>
        <p>Rifa não encontrada.</p>
        <a class="btn secundario" routerLink="/">Voltar para as rifas</a>
      </div>
    } @else if (rifa(); as r) {
      <div class="pagina-titulo">
        <div>
          <a routerLink="/" class="texto-pequeno">← Todas as rifas</a>
          <h1 style="margin-top:4px">{{ r.titulo }}</h1>
          <p class="sub">
            <span class="badge" [class]="classeSituacao()">{{ rotuloSituacao() }}</span>
            @if (r.valorNumero) { · {{ formatarMoeda(r.valorNumero) }} por número }
          </p>
        </div>
        @if (numerosSelecionados().length) {
          <button class="btn sucesso" (click)="abrirReserva()">
            Reservar {{ numerosSelecionados().length }}
            {{ numerosSelecionados().length === 1 ? 'número' : 'números' }}
          </button>
        }
      </div>

      @if (r.sorteada && r.numero_sorteado !== null) {
        <div class="card mb">
          <div class="sorteio-box">
            <div class="rot">Número sorteado</div>
            <div class="num-grande">{{ pad(r.numero_sorteado ?? 0) }}</div>
            @if (r.ganhador_nome) {
              <div class="ganhador">🎉 {{ r.ganhador_nome }}</div>
            }
          </div>
        </div>
      }

      <div class="painel-linha">
        <div class="card">
          <div class="card-titulo">
            <h2>Escolha seus números</h2>
            <div class="dir">
              <span class="texto-pequeno">{{ livre() }} livres</span>
            </div>
          </div>
          <div class="legenda">
            <span class="item"><span class="amostra livre"></span> Livre</span>
            <span class="item"><span class="amostra reservado"></span> Reservado</span>
            <span class="item"><span class="amostra pago"></span> Pago</span>
            <span class="item"><span class="amostra sel"></span> Selecionado</span>
          </div>

          <div class="grade-numeros">
            @for (n of numeros(); track n.numero) {
              <button
                type="button"
                class="num"
                [class.selecionado]="selecionado(n.numero)"
                [class.reservado]="n.status === 'reservado'"
                [class.pago]="n.status === 'pago'"
                [class.destaque]="r.sorteada && n.numero === r.numero_sorteado"
                [disabled]="n.status !== 'livre' || r.encerrada"
                [title]="tituloNumero(n)"
                (click)="alternar(n)"
              >
                {{ pad(n.numero) }}
              </button>
            }
          </div>

          @if (r.encerrada && !r.sorteada) {
            <div class="aviso atencao mt">Esta rifa foi encerrada e não aceita mais reservas.</div>
          }
        </div>

        <div>
          <div class="card">
            <div class="card-titulo"><h2>Como participar</h2></div>
            <ol style="margin:0;padding-left:20px;font-size:.88rem;color:var(--cinza-700);line-height:1.7">
              <li>Escolha um ou mais números livres.</li>
              <li>Informe nome, e-mail, telefone e cidade.</li>
              <li>
                Pague
                @if (r.valorNumero) { <b>{{ formatarMoeda(r.valorNumero * numerosSelecionados().length || r.valorNumero) }}</b> }
                e envie o comprovante.
              </li>
              <li>Aguarde a confirmação do administrador.</li>
            </ol>
            <div class="divisor"></div>
            <p class="texto-pequeno" style="margin:0">
              A reserva não garante a participação: ela só é confirmada após o pagamento ser
              validado pelo administrador.
            </p>
          </div>

          @if (r.premios.length) {
            <div class="card">
              <div class="card-titulo"><h2>🏆 Prêmios</h2></div>
              @for (p of r.premios; track p.id) {
                <div class="flex" style="padding:6px 0;border-bottom:1px solid var(--cinza-100)">
                  <span class="badge badge-amarelo">{{ p.posicao }}º</span>
                  <span style="font-size:.9rem">{{ p.descricao }}</span>
                </div>
              }
            </div>
          }

          @if (r.chave_pix || r.instrucoes_pagamento) {
            <div class="card">
              <div class="card-titulo"><h2>💳 Pagamento</h2></div>
              @if (r.chave_pix) {
                <div class="campo" style="margin-bottom:10px">
                  <label>Chave PIX</label>
                  <div class="flex">
                    <input readonly [value]="r.chave_pix" style="flex:1" />
                    <button class="btn pequeno secundario" (click)="copiar(r.chave_pix!)">Copiar</button>
                  </div>
                </div>
              }
              @if (r.instrucoes_pagamento) {
                <p class="texto-pequeno" style="white-space:pre-line;margin:0">{{ r.instrucoes_pagamento }}</p>
              }
            </div>
          }

          @if (r.regulamento) {
            <div class="card">
              <div class="card-titulo"><h2>📄 Regulamento</h2></div>
              <p class="texto-pequeno" style="white-space:pre-line;margin:0">{{ r.regulamento }}</p>
            </div>
          }
        </div>
      </div>

      <!-- ============ Modal de reserva ============ -->
      @if (modalAberto()) {
        <div class="modal-fundo" (click)="fecharModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-titulo">
              <h2>Confirmar reserva</h2>
              <button class="modal-fechar" (click)="fecharModal()" aria-label="Fechar">×</button>
            </div>

            <div class="aviso info">
              Números escolhidos:
              <b>{{ listaSelecionada() }}</b>
            </div>

            @if (erro()) { <div class="aviso erro">{{ erro() }}</div> }

            @if (temParticipanteSalvo() && !editandoDados()) {
              <div class="aviso sucesso">
                <div><b>{{ participante().nome }}</b> — {{ participante().email }}</div>
                <div class="texto-pequeno">{{ participante().telefone }} · {{ participante().cidade }}</div>
                <button class="btn pequeno secundario mt-pequeno" (click)="editandoDados.set(true)">
                  Usar outros dados
                </button>
              </div>
            } @else {
              <div class="campo">
                <label for="nome">Nome completo *</label>
                <input id="nome" [(ngModel)]="participante().nome" name="nome" placeholder="Seu nome" />
              </div>
              <div class="linha-form">
                <div class="campo">
                  <label for="email">E-mail *</label>
                  <input id="email" type="email" [(ngModel)]="participante().email" name="email" placeholder="voce@email.com" />
                </div>
                <div class="campo">
                  <label for="telefone">Telefone *</label>
                  <input id="telefone" [(ngModel)]="participante().telefone" name="telefone" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div class="campo">
                <label for="cidade">Cidade *</label>
                <input id="cidade" [(ngModel)]="participante().cidade" name="cidade" placeholder="Cidade / UF" />
              </div>
            }

            <div class="flex entre mt">
              <span class="texto-pequeno">Total a pagar</span>
              <span class="moeda" style="font-size:1.15rem">{{ formatarMoeda(totalReserva()) }}</span>
            </div>

            <button class="btn largo mt" [disabled]="salvando()" (click)="confirmarReserva()">
              {{ salvando() ? 'Reservando…' : 'Confirmar reserva' }}
            </button>
            <p class="texto-pequeno texto-centro mt-pequeno" style="margin-bottom:0">
              Depois de reservar você recebe o link para enviar o comprovante.
            </p>
          </div>
        </div>
      }
    }
  `,
})
export class RifaDetalheComponent implements OnInit, OnDestroy {
  private readonly service = inject(RifasService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly rifa = signal<Rifa | null>(null);
  readonly numeros = signal<NumeroRifa[]>([]);
  readonly carregando = signal(true);
  readonly selecionados = signal<number[]>([]);
  readonly modalAberto = signal(false);
  readonly salvando = signal(false);
  readonly erro = signal('');
  readonly editandoDados = signal(false);
  readonly temParticipanteSalvo = signal(false);
  readonly participante = signal<Participante>({ nome: '', email: '', telefone: '', cidade: '' });

  readonly numerosSelecionados = computed(() => this.selecionados());
  readonly listaSelecionada = computed(() =>
    this.selecionados().map((n) => this.pad(n)).join(', '),
  );
  readonly totalReserva = computed(() => {
    const r = this.rifa();
    if (!r?.valorNumero) return 0;
    return r.valorNumero * this.selecionados().length;
  });
  readonly livre = computed(() => this.numeros().filter((n) => n.status === 'livre').length);

  private pararRifa: (() => void) | null = null;
  private pararNumeros: (() => void) | null = null;

  ngOnInit(): void {
    const id = this.rota.snapshot.paramMap.get('id') ?? '';

    try {
      const salvo = localStorage.getItem(CHAVE_PARTICIPANTE);
      if (salvo) {
        const p = JSON.parse(salvo) as Participante;
        if (p?.nome && p?.email) {
          this.participante.set(p);
          this.temParticipanteSalvo.set(true);
        }
      }
    } catch { /* ignora */ }

    this.service.obterRifa(id).then((r) => {
      this.rifa.set(r);
      this.carregando.set(false);
    });

    this.pararNumeros = this.service.observarNumeros(id, (ns) => this.numeros.set(ns));

    // Mantém o cabeçalho atualizado (contadores/status) sem recarregar a página.
    const timer = setInterval(async () => {
      const atual = await this.service.obterRifa(id);
      if (atual) this.rifa.set(atual);
    }, 20000);
    this.pararRifa = () => clearInterval(timer);
  }

  ngOnDestroy(): void {
    this.pararNumeros?.();
    this.pararRifa?.();
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  selecionado(n: number): boolean {
    return this.selecionados().includes(n);
  }

  alternar(n: NumeroRifa): void {
    if (n.status !== 'livre' || this.rifa()?.encerrada) return;
    this.selecionados.update((atual) =>
      atual.includes(n.numero) ? atual.filter((x) => x !== n.numero) : [...atual, n.numero].sort((a, b) => a - b),
    );
  }

  tituloNumero(n: NumeroRifa): string {
    if (n.status === 'pago') return `Número ${this.pad(n.numero)} — pago`;
    if (n.status === 'reservado') return `Número ${this.pad(n.numero)} — reservado`;
    return `Número ${this.pad(n.numero)} — livre`;
  }

  rotuloSituacao(): string {
    const r = this.rifa();
    return r ? SITUACAO_RIFA_LABEL[situacaoRifa(r)] : '';
  }

  classeSituacao(): string {
    const r = this.rifa();
    if (!r) return 'badge badge-cinza';
    const s = situacaoRifa(r);
    if (s === 'sorteada') return 'badge badge-roxo';
    if (s === 'encerrada') return 'badge badge-cinza';
    return 'badge badge-verde';
  }

  abrirReserva(): void {
    this.erro.set('');
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.erro.set('');
  }

  async confirmarReserva(): Promise<void> {
    const r = this.rifa();
    if (!r) return;

    const p = this.participante();
    const faltando: string[] = [];
    if (!p.nome.trim()) faltando.push('nome');
    if (!p.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) faltando.push('e-mail válido');
    if (p.telefone.replace(/\D/g, '').length < 10) faltando.push('telefone com DDD');
    if (!p.cidade.trim()) faltando.push('cidade');

    if (faltando.length) {
      this.erro.set(`Preencha: ${faltando.join(', ')}.`);
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    try {
      const { reserva, token } = await this.service.reservar(r.id, this.selecionados(), p);
      try {
        localStorage.setItem(CHAVE_PARTICIPANTE, JSON.stringify(p));
      } catch { /* ignora */ }

      this.modalAberto.set(false);
      this.selecionados.set([]);
      await this.router.navigate(['/rifa', r.id, 'reserva', reserva.id], {
        queryParams: { t: token },
      });
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível reservar. Tente novamente.');
    } finally {
      this.salvando.set(false);
    }
  }

  copiar(texto: string): void {
    navigator.clipboard?.writeText(texto);
  }

  protected readonly formatarMoeda = formatarMoeda;
}
