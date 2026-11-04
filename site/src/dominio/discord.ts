/** O botão do Discord só vira link com um endereço https de verdade. */
export function enderecoDoDiscord(valor: string | undefined): string | null {
  const texto = valor?.trim();
  if (!texto) return null;
  try {
    return new URL(texto).protocol === 'https:' ? texto : null;
  } catch {
    return null;
  }
}
