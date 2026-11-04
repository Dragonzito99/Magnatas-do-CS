const INTERVALO_DA_VARREDURA_MS = 15_000;

// Roda uma vez quando o site inicia. Sem verificador seguro, o site não sobe.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { criarVerificador } = await import('@/verificacao/verificador');
  criarVerificador(process.env);
  const { codigoDoCpf } = await import('@/dominio/verificacao');
  codigoDoCpf('00000000000', process.env.CPF_HMAC_CHAVE ?? '');

  const { obterBd } = await import('@/bd/conexao');
  const { varrer } = await import('@/dominio/varredura');
  const { controladorDoAmbiente } = await import('@/servidor-jogo/controlador');
  let varrendo = false;
  setInterval(async () => {
    // Uma varredura lenta não pode encostar na seguinte.
    if (varrendo) return;
    varrendo = true;
    try {
      await varrer(obterBd(), controladorDoAmbiente(), process.env.GRAVACOES_PASTA, new Date(), process.env.DIVERSAO_HOST);
    } catch (erro) {
      console.error('Falha na varredura:', erro);
    } finally {
      varrendo = false;
    }
  }, INTERVALO_DA_VARREDURA_MS);
}
