import { Injectable, signal } from '@angular/core';

interface PromptInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Sugestão de instalação como webapp (PWA).
 *
 * Chrome/Edge/Android disparam `beforeinstallprompt` — guardamos o evento e
 * mostramos um botão "Instalar aplicativo". No iOS não existe esse evento,
 * então exibimos a instrução manual (Compartilhar → Adicionar à Tela de Início).
 */
@Injectable({ providedIn: 'root' })
export class InstalacaoService {
  readonly podeInstalar = signal(false);
  readonly jaInstalado = signal(false);
  readonly ios = signal(false);
  readonly dispensa = signal(false);

  private promptEvent: PromptInstalacao | null = null;

  constructor() {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    this.jaInstalado.set(!!standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const ehIos = /iphone|ipad|ipod/.test(ua) || (ua.includes('mac') && 'ontouchend' in document);
    this.ios.set(ehIos && !standalone);

    // Lembra se o usuário dispensou a sugestão nesta sessão.
    try {
      this.dispensa.set(sessionStorage.getItem('rifas:instalacao-dispensada') === '1');
    } catch { /* ignora */ }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.promptEvent = e as PromptInstalacao;
      this.podeInstalar.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.jaInstalado.set(true);
      this.podeInstalar.set(false);
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* service worker é opcional: sem ele o app continua funcionando */
      });
    }
  }

  get mostrarSugestao(): boolean {
    return !this.jaInstalado() && !this.dispensa() && (this.podeInstalar() || this.ios());
  }

  async instalar(): Promise<void> {
    if (!this.promptEvent) return;
    await this.promptEvent.prompt();
    try {
      const escolha = await this.promptEvent.userChoice;
      if (escolha.outcome === 'accepted') this.podeInstalar.set(false);
    } finally {
      this.promptEvent = null;
    }
  }

  dispensar(): void {
    this.dispensa.set(true);
    try { sessionStorage.setItem('rifas:instalacao-dispensada', '1'); } catch { /* ignora */ }
  }
}
