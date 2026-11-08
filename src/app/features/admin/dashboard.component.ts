import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { RifasService } from '../../core/services/rifas.service';
import {
  Rifa, Reserva, situacaoRifa, SITUACAO_RIFA_LABEL,
  formatarMoeda, formatarData, formatarTelefone,
} from '../../core/models/rifa.models';

interface RankingParticipante {
  nome: string;
  email: string;
  telefone: string;
  cidade: string;
  numerosPagos: number;
  numerosReservados: number;
  totalGasto: number;
  reservas: number;
  ultima: string;
}

interface ResumoRifa {
  rifa: Rifa;
  reservas: number;
  pagos: number;
  arrecadado: number;
  conversao: number;
}

/**
 * Dashboard do administrador:
 *  - KPIs gerais (rifas, números, pagos, arrecadação, conversão);
 *  - ranking dos participantes mais ativos;
 *  - desempenho por rifa;
 *  - últimas reservas.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="pagina-titulo">
      <div>
        <h1>Dashboard</h1>
        <p class="sub">Visão geral de todas as rifas e dos participantes mais ativos.</p>
      </div>
      <div class="flex">
        <button class="btn secundario pequeno" (click)="recarregar()" [disabled]="carregando()">
          {{ carregando() ? 'Atualizando…' : '↻ Atualizar' }}
        </button>
        <a class="btn" routerLink="/admin/nova">+ Nova rifa</a>
      </div>
    </div>

    @if (carregando() && !rifas().length) {
      <div class="carregando"><div class="spinner"></div>Calculando indicadores…</div>
    } @else {
      <div class="kpis">
        <div class="kpi">
          <div class="rot">Rifas</div>
          <div class="val">{{ rifas().length }}</div>
          <div class="det">{{ rifasAbertas() }} em andamento</div>
        </div>
        <div class="kpi">
          <div class="rot">Números pagos</div>
          <div class="val">{{ totalPagos() }}</div>
          <div class="det">de {{ totalNumeros() }} no total</div>
        </div>
        <div class="kpi">
          <div class="rot">Participantes</div>
          <div class="val">{{ ranking().length }}</div>
          <div class="det">{{ totalReservas() }} reservas registradas</div>
        </div>
        <div class="kpi">
          <div class="rot">Conversão</div>
          <div class="val">{{ conversao() }}%</div>
          <div class="det">reservas → pagamentos</div>
        </div>
        <div class="kpi destaque">
          <div class="rot">Arrecadado</div>
          <div class="val">{{ formatarMoeda(arrecadado()) }}</div>
          <div class="det">total confirmado</div>
        </div>
      </div>

      @if (!rifas().length) {
        <div class="card vazio">
          <div class="icone">📊</div>
          <p>Cadastre a primeira rifa para começar a acompanhar os indicadores.</p>
          <a class="btn mt" routerLink="/admin/nova">Criar rifa</a>
        </div>
      } @else {
        <div class="painel-linha">
          <div class="card">
            <div class="card-titulo">
              <h2>🏅 Participantes mais ativos</h2>
              <div class="dir"><span class="texto-pequeno">por números pagos</span></div>
            </div>

            @if (!ranking().length) {
              <p class="texto-pequeno">Nenhuma reserva registrada ainda.</p>
            } @else {
              <div class="rank">
                @for (p of ranking().slice(0, 10); track p.email; let i = $index) {
                  <div class="rank-item">
                    <span class="pos" [class.primeiro]="i === 0">{{ i + 1 }}</span>
                    <div class="dados">
                      <div class="nome">{{ p.nome }} <span class="texto-pequeno">· {{ p.cidade }}</span></div>
                      <div class="barra-fundo">
                        <div class="barra-preenchida" [style.width.%]="larguraRank(p)"></div>
                      </div>
                      <div class="texto-pequeno">
                        {{ formatarTelefone(p.telefone) }} · {{ p.reservas }} reserva(s)
                      </div>
                    </div>
                    <div class="qt">
                      <div><b>{{ p.numerosPagos }}</b> pagos</div>
                      <div class="texto-pequeno">{{ p.numerosReservados }} reserv.</div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <div class="card">
            <div class="card-titulo"><h2>📈 Desempenho por rifa</h2></div>
            @if (!resumos().length) {
              <p class="texto-pequeno">Sem dados.</p>
            } @else {
              @for (s of resumos(); track s.rifa.id) {
                <div style="padding:10px 0;border-bottom:1px solid var(--cinza-100)">
                  <div class="flex entre" style="margin-bottom:6px">
                    <a [routerLink]="['/admin/rifa', s.rifa.id]" style="font-weight:600;font-size:.9rem">
                      {{ s.rifa.titulo }}
                    </a>
                    <span class="badge" [class]="classeRifa(s.rifa)">{{ rotuloRifa(s.rifa) }}</span>
                  </div>
                  <div class="barra-fundo">
                    <div class="barra-preenchida verde" [style.width.%]="s.conversao"></div>
                  </div>
                  <div class="barra-info">
                    <span>{{ s.pagos }}/{{ s.rifa.totalNumeros }} pagos · {{ s.reservas }} reservas</span>
                    <span>{{ formatarMoeda(s.arrecadado) }}</span>
                  </div>
                </div>
              }
            }
          </div>
        </div>

        <div class="card">
          <div class="card-titulo">
            <h2>🧾 Últimas reservas</h2>
            <div class="dir"><a class="texto-pequeno" routerLink="/admin">ver por rifa →</a></div>
          </div>
          @if (!ultimas().length) {
            <p class="texto-pequeno">Nenhuma reserva registrada.</p>
          } @else {
            <div class="tabela-wrap">
              <table class="tabela">
                <thead>
                  <tr>
                    <th>Participante</th>
                    <th>Rifa</th>
                    <th>Números</th>
                    <th>Valor</th>
                    <th>Data</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (rv of ultimas(); track rv.id) {
                    <tr>
                      <td>
                        <div style="font-weight:600">{{ rv.participante.nome }}</div>
                        <div class="texto-pequeno">{{ rv.participante.cidade }}</div>
                      </td>
                      <td class="texto-pequeno">{{ nomeRifa(rv.rifa_id) }}</td>
                      <td class="num-cell">{{ rv.numeros.length }}</td>
                      <td class="num-cell">{{ formatarMoeda(rv.valor_total) }}</td>
                      <td class="texto-pequeno nowrap">{{ formatarData(rv.created_at) }}</td>
                      <td>
                        <span class="badge" [class]="rv.status === 'pago' ? 'badge badge-verde' : 'badge badge-amarelo'">
                          {{ rv.status === 'pago' ? 'Pago' : 'Reservado' }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    }
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly service = inject(RifasService);

  readonly rifas = signal<Rifa[]>([]);
  readonly reservas = signal<Reserva[]>([]);
  readonly carregando = signal(true);

  readonly totalNumeros = computed(() => this.rifas().reduce((s, r) => s + r.totalNumeros, 0));
  readonly totalPagos = computed(() => this.rifas().reduce((s, r) => s + (r.totalNumerosPagos ?? 0), 0));
  readonly totalReservas = computed(() => this.reservas().length);
  readonly rifasAbertas = computed(() => this.rifas().filter((r) => !r.encerrada && !r.sorteada).length);
  readonly arrecadado = computed(() =>
    this.rifas().reduce((s, r) => s + (r.valorNumero ?? 0) * (r.totalNumerosPagos ?? 0), 0),
  );
  readonly conversao = computed(() => {
    const totalReservados = this.rifas().reduce((s, r) => s + (r.totalNumerosReservados ?? 0), 0);
    if (!totalReservados) return 0;
    return Math.round((this.totalPagos() / totalReservados) * 100);
  });

  readonly ranking = computed<RankingParticipante[]>(() => {
    const mapa = new Map<string, RankingParticipante>();
    const valorPorRifa = new Map(this.rifas().map((r) => [r.id, r.valorNumero ?? 0]));

    for (const rv of this.reservas()) {
      const chave = rv.participante.email.toLowerCase() || rv.participante.nome.toLowerCase();
      const item = mapa.get(chave) ?? {
        nome: rv.participante.nome,
        email: rv.participante.email,
        telefone: rv.participante.telefone,
        cidade: rv.participante.cidade,
        numerosPagos: 0,
        numerosReservados: 0,
        totalGasto: 0,
        reservas: 0,
        ultima: rv.created_at ?? '',
      };
      item.reservas += 1;
      item.numerosReservados += rv.numeros.length;
      if (rv.status === 'pago') {
        item.numerosPagos += rv.numeros.length;
        item.totalGasto += (valorPorRifa.get(rv.rifa_id) ?? 0) * rv.numeros.length;
      }
      if ((rv.created_at ?? '') > item.ultima) item.ultima = rv.created_at ?? '';
      mapa.set(chave, item);
    }

    return [...mapa.values()].sort(
      (a, b) => b.numerosPagos - a.numerosPagos || b.numerosReservados - a.numerosReservados || b.reservas - a.reservas,
    );
  });

  readonly resumos = computed<ResumoRifa[]>(() =>
    this.rifas()
      .map((rifa) => {
        const reservas = this.reservas().filter((r) => r.rifa_id === rifa.id);
        return {
          rifa,
          reservas: reservas.length,
          pagos: rifa.totalNumerosPagos ?? 0,
          arrecadado: (rifa.valorNumero ?? 0) * (rifa.totalNumerosPagos ?? 0),
          conversao: rifa.totalNumeros ? Math.round(((rifa.totalNumerosPagos ?? 0) / rifa.totalNumeros) * 100) : 0,
        };
      })
      .sort((a, b) => b.arrecadado - a.arrecadado),
  );

  readonly ultimas = computed(() =>
    [...this.reservas()]
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, 12),
  );

  private maiorRank = computed(() => Math.max(1, ...this.ranking().map((p) => p.numerosPagos)));

  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.carregar();
    this.timer = setInterval(() => this.carregar(true), 30000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  recarregar(): void {
    this.carregar();
  }

  private async carregar(silencioso = false): Promise<void> {
    if (!silencioso) this.carregando.set(true);
    try {
      const rifas = await new Promise<Rifa[]>((resolve) => {
        let primeira = true;
        const parar = this.service.observarRifas((lista) => {
          if (primeira) {
            primeira = false;
            resolve(lista);
          }
          this.rifas.set(lista);
          parar();
        });
      });
      const reservas = await this.service.listarTodasReservas();
      this.reservas.set(reservas);
      void rifas;
    } catch (e) {
      console.error(e);
    } finally {
      this.carregando.set(false);
    }
  }

  larguraRank(p: RankingParticipante): number {
    const base = Math.max(1, ...this.ranking().map((x) => Math.max(x.numerosPagos, x.numerosReservados)));
    return Math.round((Math.max(p.numerosPagos, p.numerosReservados) / base) * 100);
  }

  nomeRifa(id: string): string {
    return this.rifas().find((r) => r.id === id)?.titulo ?? '—';
  }

  rotuloRifa(r: Rifa): string {
    return SITUACAO_RIFA_LABEL[situacaoRifa(r)];
  }

  classeRifa(r: Rifa): string {
    const s = situacaoRifa(r);
    if (s === 'sorteada') return 'badge badge-roxo';
    if (s === 'encerrada') return 'badge badge-cinza';
    return 'badge badge-verde';
  }

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;
  protected readonly formatarTelefone = formatarTelefone;
}
