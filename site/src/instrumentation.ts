// Roda uma vez quando o site inicia. Sem verificador seguro, o site não sobe.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { criarVerificador } = await import('@/verificacao/verificador');
  criarVerificador(process.env);
  const { codigoDoCpf } = await import('@/dominio/verificacao');
  codigoDoCpf('00000000000', process.env.CPF_HMAC_CHAVE ?? '');
}
