/**
 * Avisos na hora para quem está com o site aberto (dono, 12/11/2026: a mensagem e o amigo novo tinham que aparecer
 * sem F5). O site roda num processo só, então a lista de quem está ouvindo fica na memória dele; a página recebe o aviso
 * por /api/ao-vivo e busca o que mudou. Quem estiver sem a página aberta vê tudo ao abrir, como antes.
 */
export type Novidade = { tipo: 'mensagem'; conversaId: string } | { tipo: 'conversas' } | { tipo: 'amigos' } | { tipo: 'convite' };

type Ouvinte = (novidade: Novidade) => void;

// No globalThis: as rotas e as ações do servidor podem carregar este arquivo mais de uma vez, e todas precisam da mesma
// lista.
const CHAVE = Symbol.for('magnatas.ao-vivo');
const global = globalThis as typeof globalThis & { [CHAVE]?: Map<string, Set<Ouvinte>> };
const ouvintes = (global[CHAVE] ??= new Map());

/** Passa a receber os avisos de uma conta. Devolve a função que para. */
export function ouvir(usuarioId: string, ouvinte: Ouvinte): () => void {
  const daConta = ouvintes.get(usuarioId) ?? new Set<Ouvinte>();
  daConta.add(ouvinte);
  ouvintes.set(usuarioId, daConta);
  return () => {
    daConta.delete(ouvinte);
    if (daConta.size === 0 && ouvintes.get(usuarioId) === daConta) ouvintes.delete(usuarioId);
  };
}

/** Avisa as contas. Um ouvinte com erro (a aba fechou no meio) não impede os outros. */
export function avisar(usuarioIds: Iterable<string>, novidade: Novidade): void {
  for (const usuarioId of new Set(usuarioIds)) {
    for (const ouvinte of ouvintes.get(usuarioId) ?? []) {
      try {
        ouvinte(novidade);
      } catch {
        // A conexão daquela aba já caiu; ela se reconecta sozinha.
      }
    }
  }
}
