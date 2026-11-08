import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RifasService } from '../../core/services/rifas.service';
import { AuthService } from '../../core/services/auth.service';
import { Rifa, Premio, novoId, BLOCO_NUMEROS } from '../../core/models/rifa.models';
import { BannerService } from '../../core/services/banner.service';

/** Cadastro/edição de rifa: título, quantidade de números, prêmios e pagamento. */
@Component({
  selector: 'app-rifa-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="pagina-titulo">
      <div>
        <a routerLink="/admin" class="texto-pequeno">← Painel</a>
        <h1 style="margin-top:4px">{{ editando ? 'Editar rifa' : 'Nova rifa' }}</h1>
      </div>
      @if (editando && linkRifa()) {
        <div class="flex">
          <input readonly [value]="linkRifa()" style="width:290px;padding:9px;border:1px solid var(--cinza-300);border-radius:9px;font-size:.85rem" />
          <button type="button" class="btn pequeno secundario" (click)="copiarLink()">Copiar link</button>
        </div>
      }
    </div>

    @if (carregando()) {
      <div class="carregando"><div class="spinner"></div>Carregando…</div>
    } @else {
      @if (erro()) { <div class="aviso erro">{{ erro() }}</div> }

      <form (ngSubmit)="salvar()">
        <div class="card">
          <div class="card-titulo">
            <h2>🖼️ Banner da rifa</h2>
            <div class="dir">
              <button type="button" class="btn pequeno secundario" (click)="gerarBanner()">
                Gerar banner automático
              </button>
            </div>
          </div>

          <div class="banner-preview">
            @if (bannerPreview()) {
              <img [src]="bannerPreview()!" alt="Banner da rifa" />
            } @else {
              <div class="banner-vazio">O banner será gerado com o título, descrição e prêmios.</div>
            }
          </div>

          <div class="flex mt-pequeno">
            <label class="btn pequeno secundario" style="cursor:pointer;margin:0">
              Enviar imagem
              <input type="file" accept="image/*" hidden (change)="escolherBanner($event)" />
            </label>
            <span class="texto-pequeno">
              1200 × 630 px (formato de compartilhamento). Sem imagem, o app gera um banner
              com a grade de números.
            </span>
          </div>
        </div>

        <div class="card">
          <div class="card-titulo"><h2>Dados da rifa</h2></div>

          @if (cotaTotal() !== null) {
            <div class="aviso info">
              Sua cota: <b>{{ cotaDisponivel() }}</b> de {{ cotaTotal() }} números disponíveis.
              Esta rifa usará <b>{{ totalNumeros }}</b>.
              @if (totalNumeros > (cotaDisponivel() ?? 0)) {
                <span style="color:#991b1b;font-weight:700"> — acima do disponível!</span>
              }
            </div>
          }

          <div class="campo">
            <label for="titulo">Título *</label>
            <input id="titulo" name="titulo" [(ngModel)]="titulo" required placeholder="Ex.: Rifa solidária do João" />
          </div>

          <div class="campo">
            <label for="descricao">Descrição</label>
            <textarea id="descricao" name="descricao" [(ngModel)]="descricao"
                      placeholder="Um texto curto explicando a rifa (opcional)"></textarea>
          </div>

          <div class="linha-form tres">
            <div class="campo">
              <label for="total">Quantidade de números *</label>
              <input id="total" name="total" type="number" min="1" max="2000" [(ngModel)]="totalNumeros"
                     [disabled]="naoPodeAlterarTotal" required />
              @if (naoPodeAlterarTotal) {
                <div class="dica">Já existem reservas — a quantidade não pode mais ser alterada.</div>
              } @else {
                <div class="dica">De 1 a 2000 números.</div>
              }
            </div>
            <div class="campo">
              <label for="valor">Valor por número (R$)</label>
              <input id="valor" name="valor" type="number" min="0" step="0.01" [(ngModel)]="valorNumero" placeholder="0,00" />
            </div>
            <div class="campo">
              <label for="data">Data do sorteio</label>
              <input id="data" name="data" type="date" [(ngModel)]="dataSorteio" />
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-titulo">
            <h2>🏆 Prêmios</h2>
            <div class="dir">
              <button type="button" class="btn pequeno secundario" (click)="adicionarPremio()">+ Adicionar prêmio</button>
            </div>
          </div>

          @if (!premios().length) {
            <p class="texto-pequeno" style="margin:0">Nenhum prêmio cadastrado. Adicione ao menos um para divulgar a rifa.</p>
          }

          @for (p of premios(); track p.id; let i = $index) {
            <div class="flex mb" style="align-items:flex-start">
              <div class="campo" style="width:90px;margin:0">
                <label>Posição</label>
                <input type="number" min="1" [ngModel]="p.posicao" [name]="'pos' + i"
                       (ngModelChange)="p.posicao = +$event" />
              </div>
              <div class="campo" style="flex:1;margin:0">
                <label>Descrição do prêmio</label>
                <input [ngModel]="p.descricao" [name]="'desc' + i"
                       (ngModelChange)="p.descricao = $event" placeholder="Ex.: Bicicleta aro 29" />
              </div>
              <button type="button" class="btn pequeno perigo" style="margin-top:22px" (click)="removerPremio(i)">Remover</button>
            </div>
          }
        </div>

        <div class="card">
          <div class="card-titulo"><h2>💳 Pagamento</h2></div>
          <div class="campo">
            <label for="pix">Chave PIX</label>
            <input id="pix" name="pix" [(ngModel)]="chavePix" placeholder="CPF, e-mail, telefone ou chave aleatória" />
          </div>
          <div class="campo" style="margin-bottom:0">
            <label for="instrucoes">Instruções de pagamento</label>
            <textarea id="instrucoes" name="instrucoes" [(ngModel)]="instrucoes"
                      placeholder="Ex.: Envie o comprovante pelo link da reserva. Dúvidas: (00) 00000-0000"></textarea>
          </div>
        </div>

        <div class="card">
          <div class="card-titulo"><h2>⚙️ Automação e regulamento</h2></div>

          <label class="check">
            <input type="checkbox" name="encauto" [(ngModel)]="encerramentoAutomatico" />
            <span class="txt">
              Encerrar automaticamente quando todos os números forem pagos
              <small>A rifa deixa de aceitar reservas assim que o último pagamento for confirmado.</small>
            </span>
          </label>

          <label class="check">
            <input type="checkbox" name="sortauto" [(ngModel)]="sorteioAutomatico" />
            <span class="txt">
              Sortear automaticamente após o encerramento
              <small>Só funciona junto com o encerramento automático acima.</small>
            </span>
          </label>

          <div class="campo mt">
            <label for="regulamento">Regulamento</label>
            <textarea id="regulamento" name="regulamento" [(ngModel)]="regulamento"
                      placeholder="Regras da rifa, condições, informações legais…"></textarea>
          </div>
        </div>

        <div class="flex dir mt">
          <a class="btn secundario" routerLink="/admin">Cancelar</a>
          <button class="btn" type="submit" [disabled]="salvando()">
            {{ salvando() ? 'Salvando…' : (editando ? 'Salvar alterações' : 'Criar rifa') }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [`
    .banner-preview {
      border-radius: 12px; overflow: hidden; background: #0f172a;
      aspect-ratio: 1200 / 630; display: flex; align-items: center; justify-content: center;
    }
    .banner-preview img { width: 100%; height: 100%; object-fit: cover; }
    .banner-vazio { color: #94a3b8; font-size: .86rem; padding: 24px; text-align: center; }
  `],
})
export class RifaFormComponent implements OnInit {
  private readonly service = inject(RifasService);
  private readonly auth = inject(AuthService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly banners = inject(BannerService);

  editando = false;
  carregando = signal(true);
  salvando = signal(false);
  erro = signal('');
  naoPodeAlterarTotal = false;

  titulo = '';
  descricao = '';
  totalNumeros = 100;
  valorNumero: number | null = null;
  dataSorteio = '';
  chavePix = '';
  instrucoes = '';
  regulamento = '';
  encerramentoAutomatico = true;
  sorteioAutomatico = false;
  premios = signal<Premio[]>([{ id: novoId(), posicao: 1, descricao: '' }]);

  /** Banner escolhido (base64) ou gerado automaticamente ao salvar. */
  banner = signal<string>('');
  bannerAuto = true;
  readonly processandoBanner = signal(false);

  /** Cota do administrador logado (null = ilimitada). */
  readonly cotaDisponivel = signal<number | null>(null);
  readonly cotaTotal = signal<number | null>(null);

  private rifaId = '';
  private totalOriginal = 100;

  readonly linkRifa = signal('');

  /** Prévia do banner: o escolhido, o da rifa ou um gerado na hora. */
  readonly bannerPreview = signal<string>('');

  async ngOnInit(): Promise<void> {
    this.rifaId = this.rota.snapshot.paramMap.get('id') ?? '';

    await this.carregarCota();

    if (!this.rifaId) {
      this.bannerPreview.set(this.gerarAutomatico());
      this.carregando.set(false);
      return;
    }

    this.editando = true;
    try {
      const r = await this.service.obterRifa(this.rifaId);
      if (!r) {
        this.erro.set('Rifa não encontrada.');
      } else {
        this.preencher(r);
      }
    } catch {
      this.erro.set('Não foi possível carregar a rifa.');
    } finally {
      this.carregando.set(false);
    }
  }

  private preencher(r: Rifa): void {
    this.titulo = r.titulo;
    this.descricao = r.descricao ?? '';
    this.totalNumeros = r.totalNumeros;
    this.totalOriginal = r.totalNumeros;
    this.valorNumero = r.valorNumero ?? null;
    this.dataSorteio = r.dataSorteio ?? '';
    this.chavePix = r.chave_pix ?? '';
    this.instrucoes = r.instrucoes_pagamento ?? '';
    this.regulamento = r.regulamento ?? '';
    this.encerramentoAutomatico = r.encerramento_automatico !== false;
    this.sorteioAutomatico = !!r.sorteio_automatico;
    this.premios.set(r.premios.length ? r.premios.map((p) => ({ ...p })) : [{ id: novoId(), posicao: 1, descricao: '' }]);
    this.naoPodeAlterarTotal = (r.totalNumerosReservados ?? 0) > 0;
    this.banner.set(r.banner ?? '');
    this.bannerAuto = !r.banner;
    this.bannerPreview.set(r.banner || this.gerarAutomatico());
    this.linkRifa.set(`${location.origin}/rifa/${r.id}`);
  }

  /** Consulta a cota do admin logado (null = ilimitada). */
  private async carregarCota(): Promise<void> {
    const u = this.auth.usuario();
    if (!u) return;
    const cota = u.cotaNumeros ?? null;
    this.cotaTotal.set(cota);
    if (cota === null) return;

    try {
      const minhas = await this.service.listarRifasDoAdmin(u);
      const usado = minhas
        .filter((r) => r.id !== this.rifaId)
        .reduce((soma, r) => soma + (r.totalNumeros || 0), 0);
      this.cotaDisponivel.set(Math.max(0, cota - usado));
    } catch {
      this.cotaDisponivel.set(cota);
    }
  }

  /** Banner gerado a partir dos dados atuais do formulário. */
  private gerarAutomatico(): string {
    const premio = this.premios().find((p) => p.descricao.trim())?.descricao ?? '';
    return this.banners.gerar(this.titulo || 'Nova rifa', this.descricao.slice(0, 90), premio, Number(this.totalNumeros) || 100);
  }

  gerarBanner(): void {
    this.banner.set('');
    this.bannerAuto = true;
    this.bannerPreview.set(this.gerarAutomatico());
  }

  async escolherBanner(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    this.processandoBanner.set(true);
    this.erro.set('');
    try {
      const dataUrl = await this.banners.prepararUpload(arquivo);
      this.banner.set(dataUrl);
      this.bannerAuto = false;
      this.bannerPreview.set(dataUrl);
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível usar esta imagem.');
    } finally {
      this.processandoBanner.set(false);
    }
  }

  copiarLink(): void {
    navigator.clipboard?.writeText(this.linkRifa());
  }

  adicionarPremio(): void {
    const posicao = this.premios().length + 1;
    this.premios.update((ps) => [...ps, { id: novoId(), posicao, descricao: '' }]);
  }

  removerPremio(i: number): void {
    this.premios.update((ps) => ps.filter((_, idx) => idx !== i));
  }

  async salvar(): Promise<void> {
    this.erro.set('');
    if (!this.titulo.trim()) {
      this.erro.set('Informe o título da rifa.');
      return;
    }
    if (!this.totalNumeros || this.totalNumeros < 1) {
      this.erro.set('Informe a quantidade de números.');
      return;
    }

    // Cota do administrador (SysOp não tem limite).
    const u = this.auth.usuario();
    const cota = u?.cotaNumeros ?? null;
    if (u && cota !== null) {
      const disponivel = this.cotaDisponivel() ?? cota;
      if (Number(this.totalNumeros) > disponivel) {
        this.erro.set(
          `Sua cota permite ${disponivel} número(s) e esta rifa usa ${this.totalNumeros}. ` +
            `Reduza a quantidade ou solicite mais blocos ao SysOp.`,
        );
        return;
      }
    }

    this.salvando.set(true);
    const dados: Partial<Rifa> = {
      titulo: this.titulo,
      descricao: this.descricao,
      totalNumeros: Number(this.totalNumeros),
      valorNumero: this.valorNumero !== null && this.valorNumero !== undefined ? Number(this.valorNumero) : undefined,
      dataSorteio: this.dataSorteio || undefined,
      chave_pix: this.chavePix,
      instrucoes_pagamento: this.instrucoes,
      regulamento: this.regulamento,
      premios: this.premios().filter((p) => p.descricao.trim()),
      encerramento_automatico: this.encerramentoAutomatico,
      sorteio_automatico: this.sorteioAutomatico && this.encerramentoAutomatico,
      banner: this.banner() || this.gerarAutomatico(),
    };

    try {
      if (this.editando) {
        await this.service.atualizarRifa(this.rifaId, dados);
        await this.router.navigate(['/admin/rifa', this.rifaId]);
      } else {
        const u = this.auth.usuario();
        const id = await this.service.criarRifa(dados, {
          id: u?.id ?? '',
          nome: u?.nome ?? 'Administrador',
          email: u?.email ?? '',
        });
        await this.router.navigate(['/admin/rifa', id]);
      }
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível salvar a rifa.');
    } finally {
      this.salvando.set(false);
    }
  }
}
