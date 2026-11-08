import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RifasService } from '../../core/services/rifas.service';
import { AuthService } from '../../core/services/auth.service';
import { ComprovanteService } from '../../core/services/comprovante.service';
import {
  Rifa, Reserva, NumeroRifa, Comprovante, situacaoRifa, SITUACAO_RIFA_LABEL,
  formatarMoeda, formatarData, formatarTelefone, STATUS_NUMERO_LABEL,
} from '../../core/models/rifa.models';

type Aba = 'reservas' | 'numeros' | 'sorteio';

/**
 * Gestão de uma rifa pelo administrador:
 *  - confirma/desfaz pagamentos (com visualização do comprovante em base64);
 *  - cancela reservas;
 *  - encerra a rifa e realiza o sorteio.
 */
@Component({
  selector: 'app-rifa-admin',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    @if (carregando()) {
      <div class="carregando"><div class="spinner"></div>Carregando…</div>
    } @else if (semPermissao()) {
      <div class="card vazio">
        <div class="icone">🔒</div>
        <p>Esta rifa pertence a outro administrador.</p>
        <a class="btn secundario" routerLink="/admin">Voltar ao painel</a>
      </div>
    } @else if (!rifa()) {
      <div class="card vazio">
        <div class="icone">🔍</div>
        <p>Rifa não encontrada.</p>
        <a class="btn secundario" routerLink="/admin">Voltar ao painel</a>
      </div>
    } @else if (rifa(); as r) {
      <div class="pagina-titulo">
        <div>
          <a routerLink="/admin" class="texto-pequeno">← Painel</a>
          <h1 style="margin-top:4px">{{ r.titulo }}</h1>
          <p class="sub">
            <span class="badge" [class]="classeSituacao()">{{ rotuloSituacao() }}</span>
            · {{ r.totalNumeros }} números
            @if (r.valorNumero) { · {{ formatarMoeda(r.valorNumero) }} cada }
          </p>
        </div>
        <div class="flex">
          <a class="btn secundario" [routerLink]="['/rifa', r.id]">Ver página pública</a>
          <a class="btn secundario" [routerLink]="['/admin/rifa', r.id, 'editar']">Editar</a>
          @if (!r.encerrada) {
            <button class="btn aviso" (click)="confirmarEncerramento()">Encerrar rifa</button>
          } @else if (!r.sorteada) {
            <button class="btn secundario" (click)="reabrir()">Reabrir</button>
          }
        </div>
      </div>

      @if (mensagem()) { <div class="aviso" [class]="mensagemTipo()">{{ mensagem() }}</div> }

      <!-- KPIs -->
      <div class="kpis">
        <div class="kpi">
          <div class="rot">Reservados</div>
          <div class="val">{{ r.totalNumerosReservados ?? 0 }}</div>
          <div class="det">de {{ r.totalNumeros }} números</div>
        </div>
        <div class="kpi">
          <div class="rot">Pagos</div>
          <div class="val" style="color:var(--verde)">{{ r.totalNumerosPagos ?? 0 }}</div>
          <div class="det">{{ percentualPago() }}% da rifa</div>
        </div>
        <div class="kpi">
          <div class="rot">Aguardando</div>
          <div class="val" style="color:#b45309">{{ aguardando().length }}</div>
          <div class="det">reservas não confirmadas</div>
        </div>
        <div class="kpi destaque">
          <div class="rot">Arrecadado</div>
          <div class="val">{{ formatarMoeda(arrecadado()) }}</div>
          <div class="det">pagamentos confirmados</div>
        </div>
      </div>

      @if (r.sorteada) {
        <div class="card mb">
          <div class="sorteio-box">
            <div class="rot">Resultado do sorteio</div>
            <div class="num-grande">{{ pad(r.numero_sorteado ?? 0) }}</div>
            @if (r.ganhador_nome) { <div class="ganhador">🎉 {{ r.ganhador_nome }}</div> }
            <div class="rot" style="margin-top:8px">{{ formatarData(r.sorteada_em) }}</div>
          </div>
        </div>
      }

      <!-- Abas -->
      <div class="flex mb" style="gap:6px">
        <button class="btn pequeno" [class.secundario]="aba() !== 'reservas'" (click)="aba.set('reservas')">
          Reservas ({{ reservas().length }})
        </button>
        <button class="btn pequeno" [class.secundario]="aba() !== 'numeros'" (click)="aba.set('numeros')">
          Números
        </button>
        <button class="btn pequeno" [class.secundario]="aba() !== 'sorteio'" (click)="aba.set('sorteio')">
          Sorteio
        </button>
      </div>

      <!-- ===================== RESERVAS ===================== -->
      @if (aba() === 'reservas') {
        @if (!reservas().length) {
          <div class="card vazio">
            <div class="icone">📭</div>
            <p>Nenhuma reserva ainda.</p>
            <p class="texto-pequeno">Compartilhe o link público da rifa para começar.</p>
            <button class="btn secundario mt" (click)="copiarLink()">🔗 Copiar link da rifa</button>
          </div>
        } @else {
          <div class="card" style="padding:0">
            <div class="tabela-wrap">
              <table class="tabela">
                <thead>
                  <tr>
                    <th>Participante</th>
                    <th>Números</th>
                    <th>Valor</th>
                    <th>Reserva</th>
                    <th>Comprovante</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  @for (rv of reservas(); track rv.id) {
                    <tr>
                      <td>
                        <div style="font-weight:600">{{ rv.participante.nome }}</div>
                        <div class="texto-pequeno">{{ rv.participante.email }}</div>
                        <div class="texto-pequeno">
                          {{ formatarTelefone(rv.participante.telefone) }} · {{ rv.participante.cidade }}
                        </div>
                      </td>
                      <td class="num-cell">
                        @for (n of rv.numeros; track n) {
                          <span class="badge badge-cinza" style="margin:1px">{{ pad(n) }}</span>
                        }
                      </td>
                      <td class="num-cell">{{ formatarMoeda(rv.valor_total) }}</td>
                      <td class="texto-pequeno nowrap">{{ formatarData(rv.created_at) }}</td>
                      <td>
                        @if (rv.comprovante_enviado_em) {
                          <button class="btn pequeno secundario" (click)="verComprovante(rv)">
                            👁️ Ver
                          </button>
                          <div class="texto-pequeno">{{ formatarData(rv.comprovante_enviado_em) }}</div>
                        } @else {
                          <span class="badge badge-cinza">Sem envio</span>
                        }
                      </td>
                      <td>
                        <span class="badge" [class]="rv.status === 'pago' ? 'badge badge-verde' : 'badge badge-amarelo'">
                          {{ rv.status === 'pago' ? 'Pago' : 'Reservado' }}
                        </span>
                      </td>
                      <td>
                        <div class="acoes-linha">
                          @if (rv.status !== 'pago') {
                            <button class="btn pequeno sucesso" [disabled]="processando() === rv.id" (click)="confirmarPagamento(rv)">
                              ✓ Confirmar
                            </button>
                          } @else {
                            <button class="btn pequeno secundario" [disabled]="processando() === rv.id" (click)="desfazerPagamento(rv)">
                              Desfazer
                            </button>
                          }
                          @if (!r.sorteada) {
                            <button class="btn pequeno perigo" [disabled]="processando() === rv.id" (click)="cancelarReserva(rv)">
                              Cancelar
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }

      <!-- ===================== NÚMEROS ===================== -->
      @if (aba() === 'numeros') {
        <div class="card">
          <div class="legenda">
            <span class="item"><span class="amostra livre"></span> Livre</span>
            <span class="item"><span class="amostra reservado"></span> Reservado</span>
            <span class="item"><span class="amostra pago"></span> Pago</span>
          </div>
          <div class="grade-numeros">
            @for (n of numeros(); track n.numero) {
              <button
                type="button"
                class="num"
                [class.reservado]="n.status === 'reservado'"
                [class.pago]="n.status === 'pago'"
                [class.destaque]="r.sorteada && n.numero === r.numero_sorteado"
                [title]="tituloNumero(n)"
                (click)="abrirNumero(n)"
              >
                {{ pad(n.numero) }}
              </button>
            }
          </div>
        </div>
      }

      <!-- ===================== SORTEIO ===================== -->
      @if (aba() === 'sorteio') {
        <div class="card">
          <div class="card-titulo"><h2>🎲 Realizar sorteio</h2></div>

          @if (r.sorteada) {
            <div class="aviso info">
              Esta rifa já foi sorteada. O número sorteado foi
              <b>{{ pad(r.numero_sorteado ?? 0) }}</b>@if (r.ganhador_nome) { — <b>{{ r.ganhador_nome }}</b> }.
            </div>
          } @else {
            <p class="texto-pequeno">
              O sorteio escolhe aleatoriamente um número entre os
              <b>{{ totalPagos() }} números com pagamento confirmado</b>.
              Apenas reservas pagas concorrem.
            </p>

            @if (!r.encerrada) {
              <div class="aviso atencao">
                A rifa precisa estar <b>encerrada</b> para sortear. Encerre quando todas as reservas
                que você espera já estiverem confirmadas.
              </div>
              <button class="btn aviso" (click)="confirmarEncerramento()">Encerrar rifa agora</button>
            } @else if (!totalPagos()) {
              <div class="aviso erro">Nenhum pagamento confirmado — não há participantes para sortear.</div>
            } @else {
              <button class="btn sucesso" [disabled]="sorteando()" (click)="sortear()">
                {{ sorteando() ? 'Sorteando…' : '🎲 Sortear número' }}
              </button>
            }
          }

          <div class="divisor"></div>
          <h3>Configuração automática</h3>
          <p class="texto-pequeno">
            Definida no cadastro da rifa:
            encerramento automático
            <b>{{ r.encerramento_automatico === false ? 'desligado' : 'ligado' }}</b>
            · sorteio automático
            <b>{{ r.sorteio_automatico ? 'ligado' : 'desligado' }}</b>.
          </p>
          <a class="btn pequeno secundario" [routerLink]="['/admin/rifa', r.id, 'editar']">Alterar configuração</a>
        </div>

        <div class="card">
          <div class="card-titulo"><h2>Compartilhar</h2>
          <div class="dir"><span class="texto-pequeno">link com o banner da rifa</span></div></div>
          <div class="flex">
            <input readonly [value]="linkDivulgacao()" style="flex:1;padding:10px;border:1px solid var(--cinza-300);border-radius:9px" />
            <button class="btn pequeno secundario" (click)="copiarLink()">Copiar</button>
          </div>
          <div class="flex mt-pequeno">
            <a class="btn pequeno sucesso"
               [href]="linkWhatsapp()" target="_blank" rel="noopener">
              💬 Enviar no WhatsApp
            </a>
            <button class="btn pequeno secundario" (click)="compartilhar()">📤 Compartilhar…</button>
          </div>
          <p class="texto-pequeno mt-pequeno" style="margin-bottom:0">
            O link abre a rifa direto, com o banner dela na prévia da mensagem.
          </p>
        </div>
      }

      <!-- ===================== Modal comprovante ===================== -->
      @if (comprovanteAberto()) {
        <div class="modal-fundo" (click)="fecharComprovante()">
          <div class="modal largo" (click)="$event.stopPropagation()">
            <div class="modal-titulo">
              <h2>Comprovante de {{ comprovanteAberto()?.participante?.nome }}</h2>
              <button class="modal-fechar" (click)="fecharComprovante()">×</button>
            </div>
            @if (carregandoComprovante()) {
              <div class="carregando"><div class="spinner"></div>Carregando comprovante…</div>
            } @else if (comprovante(); as c) {
              <div class="texto-pequeno mb">
                {{ c.nome }} · {{ comprovanteSrv.formatarTamanho(c.tamanho) }}
                @if (c.enviado_em) { · {{ formatarData(c.enviado_em) }} }
              </div>
              @if (c.tipo === 'application/pdf') {
                <div class="comprovante-preview">
                  <p class="texto-pequeno">PDF do comprovante</p>
                  <div class="flex" style="justify-content:center">
                    <button class="btn pequeno" (click)="comprovanteSrv.abrir(c.base64)">Abrir PDF</button>
                    <button class="btn pequeno secundario" (click)="comprovanteSrv.baixar(c.base64, c.nome)">Baixar</button>
                  </div>
                </div>
              } @else {
                <div class="comprovante-preview">
                  <img [src]="c.base64" alt="Comprovante" />
                </div>
              }
              <div class="flex dir mt">
                <button class="btn secundario" (click)="comprovanteSrv.baixar(c.base64, c.nome)">⬇️ Baixar</button>
                @if (comprovanteAberto()?.status !== 'pago') {
                  <button class="btn sucesso" (click)="confirmarPeloModal()">✓ Confirmar pagamento</button>
                }
              </div>
            } @else {
              <div class="aviso atencao">Nenhum comprovante encontrado para esta reserva.</div>
            }
          </div>
        </div>
      }

      <!-- ===================== Modal número ===================== -->
      @if (numeroAberto(); as n) {
        <div class="modal-fundo" (click)="numeroAberto.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-titulo">
              <h2>Número {{ pad(n.numero) }}</h2>
              <button class="modal-fechar" (click)="numeroAberto.set(null)">×</button>
            </div>
            <p>
              Status: <span class="badge" [class]="classeNumero(n.status)">{{ rotuloNumero(n.status) }}</span>
            </p>
            @if (n.participante_nome) {
              <div class="card" style="box-shadow:none;background:#fafbfc">
                <div><b>{{ n.participante_nome }}</b></div>
                <div class="texto-pequeno">{{ n.participante_email }}</div>
                <div class="texto-pequeno">
                  {{ formatarTelefone(n.participante_telefone) }} · {{ n.participante_cidade }}
                </div>
              </div>
            } @else {
              <p class="texto-pequeno">Número livre.</p>
            }
          </div>
        </div>
      }
    }
  `,
})
export class RifaAdminComponent implements OnInit, OnDestroy {
  private readonly service = inject(RifasService);
  private readonly auth = inject(AuthService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly comprovanteSrv = inject(ComprovanteService);

  readonly rifa = signal<Rifa | null>(null);
  /** Admin tentando abrir rifa de outro administrador. */
  readonly semPermissao = signal(false);
  readonly numeros = signal<NumeroRifa[]>([]);
  readonly reservas = signal<Reserva[]>([]);
  readonly carregando = signal(true);
  readonly aba = signal<Aba>('reservas');
  readonly processando = signal<string | null>(null);
  readonly sorteando = signal(false);
  readonly mensagem = signal('');
  readonly mensagemTipo = signal('aviso info');

  readonly comprovanteAberto = signal<Reserva | null>(null);
  readonly comprovante = signal<Comprovante | null>(null);
  readonly carregandoComprovante = signal(false);
  readonly numeroAberto = signal<NumeroRifa | null>(null);

  readonly aguardando = computed(() => this.reservas().filter((r) => r.status !== 'pago'));
  readonly totalPagos = computed(() => this.numeros().filter((n) => n.status === 'pago').length);
  readonly arrecadado = computed(() => {
    const r = this.rifa();
    if (!r?.valorNumero) return 0;
    return r.valorNumero * (r.totalNumerosPagos ?? 0);
  });

  private rifaId = '';
  private pararNumeros: (() => void) | null = null;
  private pararReservas: (() => void) | null = null;
  private pararRifa: (() => void) | null = null;

  ngOnInit(): void {
    this.rifaId = this.rota.snapshot.paramMap.get('id') ?? '';

    this.service.obterRifa(this.rifaId).then((r) => {
      const u = this.auth.usuario();
      if (r && u && u.perfil !== 'SYSOP' && !this.service.ehDonoDaRifa(r, u)) {
        this.semPermissao.set(true);
        this.rifa.set(null);
      } else {
        this.rifa.set(r);
      }
      this.carregando.set(false);
    });

    this.pararNumeros = this.service.observarNumeros(this.rifaId, (ns) => this.numeros.set(ns));
    this.pararReservas = this.service.observarReservas(this.rifaId, (rs) => this.reservas.set(rs));

    // Recarrega o documento da rifa quando os contadores mudam.
    const timer = setInterval(async () => {
      const r = await this.service.obterRifa(this.rifaId);
      if (r) this.rifa.set(r);
    }, 12000);
    this.pararRifa = () => clearInterval(timer);

    setTimeout(() => this.carregando.set(false), 8000);
  }

  ngOnDestroy(): void {
    this.pararNumeros?.();
    this.pararReservas?.();
    this.pararRifa?.();
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  percentualPago(): number {
    const r = this.rifa();
    if (!r?.totalNumeros) return 0;
    return Math.round(((r.totalNumerosPagos ?? 0) / r.totalNumeros) * 100);
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

  rotuloNumero(status: NumeroRifa['status']): string {
    return STATUS_NUMERO_LABEL[status];
  }

  classeNumero(status: NumeroRifa['status']): string {
    if (status === 'pago') return 'badge badge-verde';
    if (status === 'reservado') return 'badge badge-amarelo';
    return 'badge badge-cinza';
  }

  tituloNumero(n: NumeroRifa): string {
    const quem = n.participante_nome ? ` — ${n.participante_nome}` : '';
    return `Número ${this.pad(n.numero)} — ${STATUS_NUMERO_LABEL[n.status]}${quem}`;
  }

  abrirNumero(n: NumeroRifa): void {
    this.numeroAberto.set(n);
  }

  private aviso(texto: string, tipo = 'aviso sucesso'): void {
    this.mensagem.set(texto);
    this.mensagemTipo.set(tipo);
    setTimeout(() => this.mensagem.set(''), 6000);
  }

  private admin(): { id: string; nome: string } {
    const u = this.auth.usuario();
    return { id: u?.id ?? '', nome: u?.nome ?? 'Administrador' };
  }

  async confirmarPagamento(rv: Reserva): Promise<void> {
    this.processando.set(rv.id);
    try {
      const res = await this.service.confirmarPagamento(this.rifaId, rv.id, this.admin());
      if (res.sorteada && res.numeroSorteado !== undefined) {
        this.aviso(`Pagamento confirmado. Todos os números foram pagos — rifa encerrada e sorteada: ${this.pad(res.numeroSorteado)}!`);
      } else if (res.encerrada) {
        this.aviso('Pagamento confirmado. Todos os números foram pagos — rifa encerrada automaticamente.');
      } else {
        this.aviso(`Pagamento de ${rv.participante.nome} confirmado.`);
      }
      const r = await this.service.obterRifa(this.rifaId);
      if (r) this.rifa.set(r);
    } catch (e) {
      this.aviso(e instanceof Error ? e.message : 'Falha ao confirmar o pagamento.', 'aviso erro');
    } finally {
      this.processando.set(null);
    }
  }

  async desfazerPagamento(rv: Reserva): Promise<void> {
    if (!confirm(`Desfazer a confirmação do pagamento de ${rv.participante.nome}?`)) return;
    this.processando.set(rv.id);
    try {
      await this.service.desfazerPagamento(this.rifaId, rv.id);
      this.aviso('Confirmação desfeita — a reserva voltou para "aguardando pagamento".', 'aviso atencao');
      const r = await this.service.obterRifa(this.rifaId);
      if (r) this.rifa.set(r);
    } catch (e) {
      this.aviso(e instanceof Error ? e.message : 'Falha ao desfazer.', 'aviso erro');
    } finally {
      this.processando.set(null);
    }
  }

  async cancelarReserva(rv: Reserva): Promise<void> {
    if (!confirm(`Cancelar a reserva de ${rv.participante.nome}? Os números voltam a ficar livres.`)) return;
    this.processando.set(rv.id);
    try {
      await this.service.cancelarReserva(this.rifaId, rv.id);
      this.aviso('Reserva cancelada e números liberados.', 'aviso atencao');
      const r = await this.service.obterRifa(this.rifaId);
      if (r) this.rifa.set(r);
    } catch (e) {
      this.aviso(e instanceof Error ? e.message : 'Falha ao cancelar.', 'aviso erro');
    } finally {
      this.processando.set(null);
    }
  }

  async verComprovante(rv: Reserva): Promise<void> {
    this.comprovanteAberto.set(rv);
    this.comprovante.set(null);
    this.carregandoComprovante.set(true);
    try {
      const c = await this.service.obterComprovante(this.rifaId, rv.id);
      this.comprovante.set(c);
    } catch {
      this.comprovante.set(null);
    } finally {
      this.carregandoComprovante.set(false);
    }
  }

  fecharComprovante(): void {
    this.comprovanteAberto.set(null);
    this.comprovante.set(null);
  }

  async confirmarPeloModal(): Promise<void> {
    const rv = this.comprovanteAberto();
    if (!rv) return;
    this.fecharComprovante();
    await this.confirmarPagamento(rv);
  }

  confirmarEncerramento(): void {
    const r = this.rifa();
    if (!r) return;
    const pendentes = this.aguardando().length;
    const msg = pendentes
      ? `Ainda há ${pendentes} reserva(s) aguardando pagamento. Encerrar mesmo assim?`
      : 'Encerrar esta rifa? Ela não aceitará novas reservas.';
    if (!confirm(msg)) return;
    this.service
      .encerrarRifa(this.rifaId, 'manual', this.admin())
      .then(async () => {
        this.aviso('Rifa encerrada.');
        const atual = await this.service.obterRifa(this.rifaId);
        if (atual) this.rifa.set(atual);
        this.aba.set('sorteio');
      })
      .catch((e) => this.aviso(e instanceof Error ? e.message : 'Falha ao encerrar.', 'aviso erro'));
  }

  async reabrir(): Promise<void> {
    if (!confirm('Reabrir a rifa para novas reservas?')) return;
    try {
      await this.service.reabrirRifa(this.rifaId);
      const atual = await this.service.obterRifa(this.rifaId);
      if (atual) this.rifa.set(atual);
      this.aviso('Rifa reaberta.', 'aviso atencao');
    } catch (e) {
      this.aviso(e instanceof Error ? e.message : 'Falha ao reabrir.', 'aviso erro');
    }
  }

  async sortear(): Promise<void> {
    if (!confirm(`Sortear agora entre ${this.totalPagos()} números pagos? Esta ação não pode ser desfeita.`)) return;
    this.sorteando.set(true);
    try {
      const res = await this.service.sortear(this.rifaId, this.admin());
      const atual = await this.service.obterRifa(this.rifaId);
      if (atual) this.rifa.set(atual);
      this.aviso(`Sorteio realizado: número ${this.pad(res.numero)}${res.ganhador ? ` — ${res.ganhador}` : ''}!`);
    } catch (e) {
      this.aviso(e instanceof Error ? e.message : 'Falha ao sortear.', 'aviso erro');
    } finally {
      this.sorteando.set(false);
    }
  }

  /** Página real da rifa (SPA). */
  linkPublico(): string {
    return `${location.origin}/rifa/${this.rifaId}`;
  }

  /**
   * Link para divulgar em grupos: /r/<id> serve um HTML com as tags Open Graph
   * da rifa (banner dela na prévia do WhatsApp) e redireciona para a rifa.
   */
  linkDivulgacao(): string {
    return `${location.origin}/r/${this.rifaId}`;
  }

  copiarLink(): void {
    const url = this.linkDivulgacao();
    navigator.clipboard?.writeText(url);
    this.aviso(`Link para divulgar copiado: ${url}`, 'aviso info');
  }

  /** Link "clique e converse" do WhatsApp com a mensagem pronta. */
  linkWhatsapp(): string {
    const url = this.linkDivulgacao();
    const r = this.rifa();
    const texto = `🎟️ ${r?.titulo ?? 'Rifa'}\n\nReserve seu número e participe!\n${url}`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }

  async compartilhar(): Promise<void> {
    const url = this.linkDivulgacao();
    const r = this.rifa();
    if (navigator.share) {
      try {
        await navigator.share({ title: r?.titulo ?? 'Rifa', text: 'Reserve seu número e participe!', url });
      } catch { /* usuário cancelou */ }
      return;
    }
    this.copiarLink();
  }

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;
  protected readonly formatarTelefone = formatarTelefone;
}
