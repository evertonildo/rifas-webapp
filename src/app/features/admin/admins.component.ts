import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminsService, UsoCota } from '../../core/services/admins.service';
import { AuthService } from '../../core/services/auth.service';
import { RifasService } from '../../core/services/rifas.service';
import {
  Usuario, Perfil, PERFIL_LABEL, PERFIL_DESCRICAO, BLOCO_NUMEROS,
  formatarTelefone,
} from '../../core/models/rifa.models';

/**
 * Cadastro de administradores — disponível APENAS para o perfil SYSOP.
 *
 * Ao criar, define nome, e-mail, telefone e quantos blocos de 100 números o
 * admin recebe. Os blocos podem ser distribuídos livremente entre as rifas
 * que ele criar (100 = 1 rifa de 100, ou 2 de 50, ou 4 de 25...).
 */
@Component({
  selector: 'app-admins',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pagina-titulo">
      <div>
        <h1>Administradores</h1>
        <p class="sub">
          Crie acessos e defina quantos números cada administrador pode distribuir nas rifas dele.
        </p>
      </div>
      <button class="btn" (click)="abrirCadastro()">+ Novo administrador</button>
    </div>

    @if (mensagem()) { <div class="aviso" [class]="mensagemTipo()">{{ mensagem() }}</div> }

    <!-- ============ formulário ============ -->
    @if (formAberto()) {
      <div class="card mb">
        <div class="card-titulo">
          <h2>{{ editandoId() ? 'Editar administrador' : 'Novo administrador' }}</h2>
          <div class="dir"><button class="btn-fantasma" (click)="fecharForm()">Cancelar</button></div>
        </div>

        <div class="linha-form">
          <div class="campo">
            <label for="nome">Nome completo *</label>
            <input id="nome" [(ngModel)]="form.nome" placeholder="Nome do administrador" />
          </div>
          <div class="campo">
            <label for="email">E-mail *</label>
            <input id="email" type="email" [(ngModel)]="form.email" [disabled]="!!editandoId()"
                   placeholder="admin@email.com" />
            @if (editandoId()) { <div class="dica">O e-mail de acesso não pode ser alterado.</div> }
          </div>
        </div>

        <div class="linha-form">
          <div class="campo">
            <label for="telefone">Telefone *</label>
            <input id="telefone" [(ngModel)]="form.telefone" placeholder="(00) 00000-0000" />
          </div>
          <div class="campo">
            <label for="perfil">Perfil *</label>
            <select id="perfil" [(ngModel)]="form.perfil">
              <option value="ADMIN">Administrador</option>
              <option value="OPERATOR">Operador</option>
              <option value="SYSOP">SysOp (acesso total)</option>
            </select>
            <div class="dica">{{ PERFIL_DESCRICAO[form.perfil] }}</div>
          </div>
        </div>

        <div class="campo">
          <label>Blocos de números liberados {{ form.perfil === 'SYSOP' ? '' : '*' }}</label>
          @if (form.perfil === 'SYSOP') {
            <div class="aviso info" style="margin:0">
              O perfil <b>SysOp</b> tem cota ilimitada de números.
            </div>
          } @else {
          <div class="flex">
            <select [(ngModel)]="form.blocos" style="max-width:220px">
              @for (b of opcoesBlocos; track b) {
                <option [ngValue]="b">{{ b }} bloco{{ b > 1 ? 's' : '' }} = {{ b * 100 }} números</option>
              }
            </select>
            <span class="texto-pequeno">
              {{ form.blocos * 100 }} números: dá para 1 rifa de {{ form.blocos * 100 }},
              2 de {{ form.blocos * 50 }} ou 4 de {{ form.blocos * 25 }}.
            </span>
          </div>
          }
          <div class="dica">
            Cada rifa criada consome a quantidade de números dela. Ao excluir uma rifa, os números
            voltam para a cota.
          </div>
        </div>

        @if (!editandoId()) {
          <div class="campo">
            <label for="senha">Senha inicial *</label>
            <input id="senha" [(ngModel)]="form.senhaInicial" placeholder="Mínimo 6 caracteres" />
            <div class="dica">
              O administrador entra com este e-mail e senha. Ele pode alterar a senha depois;
              se esquecer, use "Enviar redefinição".
            </div>
          </div>
        }

        @if (erroForm()) { <div class="aviso erro">{{ erroForm() }}</div> }

        <div class="flex dir">
          <button class="btn secundario" (click)="fecharForm()">Cancelar</button>
          <button class="btn" [disabled]="salvando()" (click)="salvar()">
            {{ salvando() ? 'Salvando…' : (editandoId() ? 'Salvar alterações' : 'Criar administrador') }}
          </button>
        </div>
      </div>
    }

    <!-- ============ lista ============ -->
    @if (carregando()) {
      <div class="carregando"><div class="spinner"></div>Carregando administradores…</div>
    } @else if (!admins().length) {
      <div class="card vazio">
        <div class="icone">👥</div>
        <p>Nenhum administrador cadastrado além de você.</p>
        <button class="btn mt" (click)="abrirCadastro()">Criar o primeiro administrador</button>
      </div>
    } @else {
      <div class="grade-admins">
        @for (a of admins(); track a.id) {
          <div class="card admin-card">
            <div class="flex entre">
              <div>
                <div style="font-weight:700">{{ a.nome }}</div>
                <div class="texto-pequeno">{{ a.email }}</div>
                <div class="texto-pequeno">
                  {{ formatarTelefone(a.telefone) || 'sem telefone' }}
                </div>
              </div>
              <span class="badge" [class]="classePerfil(a.perfil)">{{ PERFIL_LABEL[a.perfil] }}</span>
            </div>

            <div class="divisor"></div>

            @if (uso()[a.id]; as u) {
              <div class="texto-pequeno flex entre">
                <span>Cota de números</span>
                <span>
                  @if (u.cotaNumeros === null) {
                    <b>ilimitada</b>
                  } @else {
                    <b>{{ u.usado }}</b> / {{ u.cotaNumeros }} usados
                  }
                </span>
              </div>
              @if (u.cotaNumeros !== null) {
                <div class="barra-fundo mt-pequeno">
                  <div class="barra-preenchida" [class.verde]="u.percentual < 90"
                       [style.width.%]="u.percentual"></div>
                </div>
                <div class="texto-pequeno mt-pequeno">
                  {{ u.disponivel }} números disponíveis · {{ u.rifas }} rifa(s)
                </div>
              }
            }

            <div class="acoes-linha mt">
              <button class="btn pequeno secundario" (click)="editar(a)">Editar</button>
              <button class="btn pequeno secundario" (click)="redefinirSenha(a)">Redefinir senha</button>
              @if (a.id !== meuId()) {
                <button class="btn pequeno perigo" (click)="excluir(a)">Excluir</button>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .grade-admins { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
    .admin-card { display: flex; flex-direction: column; }
    .barra-preenchida { background: var(--amarelo); }
    .barra-preenchida.verde { background: var(--verde); }
  `],
})
export class AdminsComponent implements OnInit {
  readonly PERFIL_LABEL = PERFIL_LABEL;
  readonly PERFIL_DESCRICAO = PERFIL_DESCRICAO;
  readonly opcoesBlocos = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50];

  private readonly service = inject(AdminsService);
  private readonly auth = inject(AuthService);
  private readonly rifas = inject(RifasService);

  readonly admins = signal<Usuario[]>([]);
  readonly uso = signal<Record<string, UsoCota>>({});
  readonly carregando = signal(true);
  readonly formAberto = signal(false);
  readonly editandoId = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly erroForm = signal('');
  readonly mensagem = signal('');
  readonly mensagemTipo = signal('aviso sucesso');

  form = this.formVazio();

  readonly meuId = computed(() => this.auth.usuario()?.id ?? '');

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  private formVazio() {
    return {
      nome: '',
      email: '',
      telefone: '',
      perfil: 'ADMIN' as Perfil,
      blocos: 1,
      senhaInicial: '',
    };
  }

  private async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      const lista = await this.service.listar();
      this.admins.set(lista);

      const todasRifas = await this.rifas.listarRifas();
      const novoUso: Record<string, UsoCota> = {};
      for (const a of lista) {
        const minhas = todasRifas.filter((r) => this.rifas.ehDonoDaRifa(r, a));
        novoUso[a.id] = await this.service.usoCota(a, minhas);
      }
      this.uso.set(novoUso);
    } catch (e) {
      this.aviso('Não foi possível carregar os administradores.', 'aviso erro');
      console.error(e);
    } finally {
      this.carregando.set(false);
    }
  }

  abrirCadastro(): void {
    this.form = this.formVazio();
    this.editandoId.set(null);
    this.erroForm.set('');
    this.formAberto.set(true);
  }

  editar(a: Usuario): void {
    this.form = {
      nome: a.nome,
      email: a.email,
      telefone: a.telefone ?? '',
      perfil: a.perfil,
      blocos: a.cotaNumeros ? Math.max(1, Math.round(a.cotaNumeros / BLOCO_NUMEROS)) : 1,
      senhaInicial: '',
    };
    this.editandoId.set(a.id);
    this.erroForm.set('');
    this.formAberto.set(true);
  }

  fecharForm(): void {
    this.formAberto.set(false);
    this.erroForm.set('');
  }

  async salvar(): Promise<void> {
    this.erroForm.set('');
    this.salvando.set(true);
    try {
      const id = this.editandoId();
      if (id) {
        await this.service.atualizar(id, {
          nome: this.form.nome,
          telefone: this.form.telefone,
          perfil: this.form.perfil,
          blocos: this.form.blocos,
        });
        this.aviso('Administrador atualizado.');
      } else {
        await this.service.criar({
          nome: this.form.nome,
          email: this.form.email,
          telefone: this.form.telefone,
          perfil: this.form.perfil,
          blocos: this.form.blocos,
          senhaInicial: this.form.senhaInicial,
        });
        this.aviso('Administrador criado! Envie o e-mail e a senha inicial para ele.');
      }
      this.formAberto.set(false);
      await this.carregar();
    } catch (e) {
      this.erroForm.set(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      this.salvando.set(false);
    }
  }

  async redefinirSenha(a: Usuario): Promise<void> {
    if (!confirm(`Enviar e-mail de redefinição de senha para ${a.email}?`)) return;
    try {
      await this.service.enviarRedefinicaoSenha(a.email);
      this.aviso(`E-mail de redefinição enviado para ${a.email}.`);
    } catch {
      this.aviso('Não foi possível enviar o e-mail de redefinição.', 'aviso erro');
    }
  }

  async excluir(a: Usuario): Promise<void> {
    if (!confirm(`Excluir o acesso de ${a.nome}? As rifas dele continuam existindo.`)) return;
    try {
      await this.service.excluir(a.id);
      this.aviso('Administrador excluído.', 'aviso atencao');
      await this.carregar();
    } catch {
      this.aviso('Não foi possível excluir.', 'aviso erro');
    }
  }

  classePerfil(p: Perfil): string {
    if (p === 'SYSOP') return 'badge badge-roxo';
    if (p === 'ADMIN') return 'badge badge-azul';
    return 'badge badge-cinza';
  }

  private aviso(texto: string, tipo = 'aviso sucesso'): void {
    this.mensagem.set(texto);
    this.mensagemTipo.set(tipo);
    setTimeout(() => this.mensagem.set(''), 6000);
  }

  protected readonly formatarTelefone = formatarTelefone;
}
