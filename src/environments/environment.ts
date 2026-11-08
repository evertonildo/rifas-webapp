export const environment = {
  production: false,
  /**
   * Credenciais do projeto Firebase
   * (Console → Configurações do projeto → Seus apps → App da Web).
   *
   * Substitua os valores abaixo antes de executar/deployar.
   * O login do administrador usa o Firebase Authentication (email/senha).
   * Os comprovantes são gravados em base64 no Firestore (SEM Firebase Storage).
   */
  firebase: {
    apiKey: 'SUBSTITUA-API-KEY',
    authDomain: 'SEU-PROJETO.firebaseapp.com',
    projectId: 'SEU-PROJETO',
    storageBucket: 'SEU-PROJETO.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:xxxxxxxxxxxxxxxx',
  },
  /** Limite do comprovante (Firestore aceita 1 MB por documento). */
  comprovanteMaxBytes: 700 * 1024,
  /** Tamanho máximo antes da compressão feita no navegador. */
  comprovanteMaxOriginalBytes: 8 * 1024 * 1024,
};
