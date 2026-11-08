import { environment } from '../../environments/environment';

/**
 * Regras do Firestore para o sistema de rifas.
 *
 * Resumo:
 *  - Rifas, números e reservas são legíveis publicamente (o participante não
 *    faz login). O ID aleatório da reserva funciona como link privado.
 *  - Qualquer pessoa pode CRIAR uma reserva e reservar números livres de uma
 *    rifa aberta — mas nunca marcar como pago, encerrar ou sortear.
 *  - Só administrador (perfil em usuarios/{uid}) confirma pagamento, altera
 *    cadastro da rifa, encerra e sorteia.
 */
export const REGRAS_FIRESTORE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function usuarioLogado() {
      return request.auth != null;
    }

    function ehAdmin() {
      return usuarioLogado()
        && exists(/databases/$(database)/documents/usuarios/$(request.auth.uid))
        && get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.perfil in ['SYSOP', 'ADMIN', 'OPERATOR'];
    }

    function rifaAberta(rifaId) {
      return exists(/databases/$(database)/documents/rifas/$(rifaId))
        && get(/databases/$(database)/documents/rifas/$(rifaId)).data.encerrada == false;
    }

    // ===================== USUÁRIOS =====================
    match /usuarios/{uid} {
      allow read: if ehAdmin() || (usuarioLogado() && request.auth.uid == uid);
      allow create: if usuarioLogado() && request.auth.uid == uid
        && request.resource.data.perfil == 'USER';
      allow update: if ehAdmin()
        || (usuarioLogado() && request.auth.uid == uid
            && request.resource.data.perfil == resource.data.perfil);
      allow delete: if ehAdmin();
    }

    // ===================== RIFAS =====================
    match /rifas/{rifaId} {
      allow read: if true;
      allow create, update, delete: if ehAdmin();

      // Cada número da rifa (documento próprio → consulta leve e em tempo real).
      match /numeros/{numero} {
        allow read: if true;
        allow create, delete: if ehAdmin();
        // Participante reserva um número que está livre, em rifa aberta.
        allow update: if ehAdmin()
          || (rifaAberta(rifaId)
              && resource.data.status == 'livre'
              && request.resource.data.status == 'reservado'
              && request.resource.data.numero == resource.data.numero);
      }

      // ===================== RESERVAS =====================
      match /reservas/{reservaId} {
        allow read: if true;
        // Criar reserva: sempre começa como 'reservado' e com números válidos.
        allow create: if rifaAberta(rifaId)
          && request.resource.data.status == 'reservado'
          && request.resource.data.numeros is list
          && request.resource.data.numeros.size() > 0
          && request.resource.data.numeros.size() <= 100
          && request.resource.data.participante.nome is string
          && request.resource.data.participante.email is string
          && request.resource.data.participante.telefone is string
          && request.resource.data.participante.cidade is string;
        // Participante só pode anexar comprovante: não muda status nem números.
        allow update: if ehAdmin()
          || (resource.data.status == 'reservado'
              && request.resource.data.status == resource.data.status
              && request.resource.data.numeros == resource.data.numeros);
        allow delete: if ehAdmin();

        // Comprovante em base64, em documento separado (limite de 1 MB/doc).
        match /comprovantes/{comprovanteId} {
          allow read: if true;
          allow create: if ehAdmin()
            || (rifaAberta(rifaId)
                && request.resource.data.base64 is string
                && request.resource.data.base64.size() < 950000
                && request.resource.data.base64.matches('data:(image|application/pdf).*'));
          allow update, delete: if ehAdmin();
        }
      }
    }
  }
}
`;

/** Conteúdo do arquivo firestore.rules (útil para exibir instruções). */
export const ARQUIVO_REGRAS = REGRAS_FIRESTORE;

export const INFO_AMBIENTE = {
  projectId: environment.firebase.projectId,
};
