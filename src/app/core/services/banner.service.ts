import { Injectable } from '@angular/core';

/**
 * Geração de banners das rifas no próprio navegador (canvas → JPEG base64).
 *
 * O banner segue a identidade visual do app: fundo em degradê escuro, cartão
 * de rifa com a grade de números (alguns pagos em verde, alguns reservados em
 * âmbar) e o título da rifa. Fica pronto para ser usado na vitrine e também
 * como imagem de compartilhamento (Open Graph) no WhatsApp.
 */
@Injectable({ providedIn: 'root' })
export class BannerService {
  readonly largura = 1200;
  readonly altura = 630;

  /** Gera o banner padrão de uma rifa a partir do título/descrição/prêmios. */
  gerar(titulo: string, subtitulo = '', premio = '', totalNumeros = 100): string {
    const cv = document.createElement('canvas');
    cv.width = this.largura;
    cv.height = this.altura;
    const ctx = cv.getContext('2d');
    if (!ctx) return '';

    // ---- fundo em degradê
    const grad = ctx.createLinearGradient(0, 0, this.largura, this.altura);
    grad.addColorStop(0, '#1e3a8a');
    grad.addColorStop(0.55, '#312e81');
    grad.addColorStop(1, '#6d28d9');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.largura, this.altura);

    // brilho suave
    const brilho = ctx.createRadialGradient(980, 90, 10, 980, 90, 520);
    brilho.addColorStop(0, 'rgba(56,189,248,.35)');
    brilho.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = brilho;
    ctx.fillRect(0, 0, this.largura, this.altura);

    // confete discreto (determinístico: mesmo banner a cada geração)
    let semente = 7;
    const rand = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente / 2147483648;
    };
    for (let i = 0; i < 46; i++) {
      const x = rand() * this.largura;
      const y = rand() * this.altura;
      const r = 2 + rand() * 4;
      ctx.fillStyle = `rgba(255,255,255,${0.06 + rand() * 0.16})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- cartão do título (lado esquerdo)
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    this.arredondado(ctx, 64, 96, 560, 440, 28);
    ctx.fill();

    ctx.fillStyle = '#c7d2fe';
    ctx.font = '600 24px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText('RIFA ONLINE', 104, 156);

    // título com quebra de linha
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 56px Inter, Segoe UI, Arial, sans-serif';
    this.textoQuebrado(ctx, titulo || 'Rifa', 104, 232, 480, 64, 3);

    // subtítulo / descrição curta
    if (subtitulo) {
      ctx.fillStyle = 'rgba(226,232,240,.92)';
      ctx.font = '400 24px Inter, Segoe UI, Arial, sans-serif';
      this.textoQuebrado(ctx, subtitulo, 104, 400, 480, 32, 2);
    }

    // prêmio
    if (premio) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 22px Inter, Segoe UI, Arial, sans-serif';
      this.textoQuebrado(ctx, `🏆 ${premio}`, 104, 480, 480, 28, 1);
    }

    // selo "participar"
    ctx.fillStyle = '#38bdf8';
    this.arredondado(ctx, 104, 508, 214, 52, 26);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText('Escolha seu número', 128, 542);

    // ---- cartão com a grade de números (lado direito)
    const cardX = 664;
    const cardY = 118;
    const cardL = 470;
    const cardA = 396;
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = '#ffffff';
    this.arredondado(ctx, cardX, cardY, cardL, cardA, 26);
    ctx.fill();
    ctx.restore();

    // "picote" do ticket
    ctx.fillStyle = '#eef2ff';
    this.arredondado(ctx, cardX + 20, cardY + 20, cardL - 40, cardA - 40, 18);
    ctx.fill();

    ctx.fillStyle = '#1e3a8a';
    ctx.font = '800 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText('NÚMEROS', cardX + 44, cardY + 64);

    // grade 8 x 4
    const cols = 8;
    const linhas = 4;
    const cel = 46;
    const gap = 10;
    const inicioX = cardX + 44;
    const inicioY = cardY + 88;
    const destaqueVerde = new Set([3, 11, 18, 27]);
    const destaqueAmbar = new Set([7, 21]);
    let n = 1;
    for (let l = 0; l < linhas; l++) {
      for (let c = 0; c < cols; c++) {
        const x = inicioX + c * (cel + gap);
        const y = inicioY + l * (cel + gap);
        const verde = destaqueVerde.has(n);
        const ambar = destaqueAmbar.has(n);
        ctx.fillStyle = verde ? '#dcfce7' : ambar ? '#fef3c7' : '#ffffff';
        this.arredondado(ctx, x, y, cel, cel, 10);
        ctx.fill();
        ctx.strokeStyle = verde ? '#86efac' : ambar ? '#fcd34d' : '#e2e8f0';
        ctx.lineWidth = 2;
        this.arredondado(ctx, x, y, cel, cel, 10);
        ctx.stroke();

        ctx.fillStyle = verde ? '#166534' : ambar ? '#92400e' : '#334155';
        ctx.font = '700 18px Inter, Segoe UI, Arial, sans-serif';
        const rotulo = String(n).padStart(2, '0');
        const w = ctx.measureText(rotulo).width;
        ctx.fillText(rotulo, x + (cel - w) / 2, y + cel / 2 + 7);
        n++;
      }
    }

    // rodapé do cartão
    ctx.fillStyle = '#64748b';
    ctx.font = '600 18px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText(`${totalNumeros} números disponíveis`, cardX + 44, cardY + cardA - 34);

    // selo de check
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cardX + cardL - 52, cardY + cardA - 46, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cardX + cardL - 64, cardY + cardA - 46);
    ctx.lineTo(cardX + cardL - 56, cardY + cardA - 37);
    ctx.lineTo(cardX + cardL - 40, cardY + cardA - 56);
    ctx.stroke();

    return cv.toDataURL('image/jpeg', 0.78);
  }

  /** Reduz/ajusta uma imagem escolhida pelo admin para o formato do banner. */
  async prepararUpload(arquivo: File): Promise<string> {
    const bitmap = await this.carregar(arquivo);
    const cv = document.createElement('canvas');
    cv.width = this.largura;
    cv.height = this.altura;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('Não foi possível processar a imagem.');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.largura, this.altura);

    // cobre a área mantendo a proporção (crop centralizado)
    const escala = Math.max(this.largura / bitmap.width, this.altura / bitmap.height);
    const w = bitmap.width * escala;
    const h = bitmap.height * escala;
    ctx.drawImage(bitmap, (this.largura - w) / 2, (this.altura - h) / 2, w, h);

    return cv.toDataURL('image/jpeg', 0.8);
  }

  private async carregar(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(arquivo);
      } catch { /* cai no <img> */ }
    }
    const url = URL.createObjectURL(arquivo);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Formato de imagem não suportado.'));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  }

  private arredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const raio = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + raio, y);
    ctx.arcTo(x + w, y, x + w, y + h, raio);
    ctx.arcTo(x + w, y + h, x, y + h, raio);
    ctx.arcTo(x, y + h, x, y, raio);
    ctx.arcTo(x, y, x + w, y, raio);
    ctx.closePath();
  }

  private textoQuebrado(
    ctx: CanvasRenderingContext2D,
    texto: string,
    x: number,
    y: number,
    maxLargura: number,
    alturaLinha: number,
    maxLinhas: number,
  ): void {
    const palavras = (texto || '').split(/\s+/).filter(Boolean);
    const linhas: string[] = [];
    let atual = '';
    for (const palavra of palavras) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(teste).width > maxLargura && atual) {
        linhas.push(atual);
        atual = palavra;
        if (linhas.length === maxLinhas) break;
      } else {
        atual = teste;
      }
    }
    if (linhas.length < maxLinhas && atual) linhas.push(atual);

    linhas.forEach((linha, i) => {
      const texto2 = i === maxLinhas - 1 && linhas.length === maxLinhas ? this.encurtar(ctx, linha, maxLargura) : linha;
      ctx.fillText(texto2, x, y + i * alturaLinha);
    });
  }

  private encurtar(ctx: CanvasRenderingContext2D, texto: string, maxLargura: number): string {
    if (ctx.measureText(texto).width <= maxLargura) return texto;
    let t = texto;
    while (t.length > 3 && ctx.measureText(`${t}…`).width > maxLargura) t = t.slice(0, -1);
    return `${t}…`;
  }
}
