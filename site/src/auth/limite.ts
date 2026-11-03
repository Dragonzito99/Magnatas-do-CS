/** Limite simples em memória. Basta para um único processo do site. */
export function criarLimitador(maximo: number, janelaMs: number) {
  const contagens = new Map<string, { inicio: number; total: number }>();

  return function permitir(chave: string, agora: number = Date.now()): boolean {
    for (const [outra, registro] of contagens) {
      if (agora - registro.inicio >= janelaMs) contagens.delete(outra);
    }
    const registro = contagens.get(chave);
    if (!registro) {
      contagens.set(chave, { inicio: agora, total: 1 });
      return true;
    }
    registro.total += 1;
    return registro.total <= maximo;
  };
}
