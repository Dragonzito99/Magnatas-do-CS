const INTERVALO_DA_VARREDURA_MS = 15_000;
const INTERVALO_DA_STEAM_MS = 30 * 60_000;
const INTERVALO_DO_TIER_S_MS = 10 * 60_000;

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

  // Fontes de fora da tela principal. A página só lê o banco; aqui o banco é abastecido.
  const { atualizarNoticiasSteam } = await import('@/dominio/noticias-steam');
  const { atualizarTierS } = await import('@/dominio/tier-s');
  const { criarTradutor } = await import('@/servidor-jogo/tradutor');
  const { criarClienteLiquipedia } = await import('@/servidor-jogo/liquipedia');
  const tradutor = criarTradutor(process.env.ANTHROPIC_API_KEY);
  // Um cliente só, para a fila respeitar os intervalos da Liquipedia entre todas as rodadas.
  const liquipedia = criarClienteLiquipedia(process.env.LIQUIPEDIA_CONTATO);
  const buscarJson = async (url: string) => {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!resposta.ok) throw new Error(`Resposta ${resposta.status} de ${new URL(url).host}.`);
    return resposta.json();
  };
  const repetir = (nome: string, intervaloMs: number, tarefa: () => Promise<void>) => {
    let rodando = false;
    const rodar = async () => {
      if (rodando) return;
      rodando = true;
      try {
        await tarefa();
      } catch (erro) {
        console.error(`Falha em ${nome}:`, erro);
      } finally {
        rodando = false;
      }
    };
    setTimeout(rodar, 30_000);
    setInterval(rodar, intervaloMs);
  };
  repetir('notícias da Steam', INTERVALO_DA_STEAM_MS, () => atualizarNoticiasSteam(obterBd(), buscarJson, tradutor));
  if (liquipedia) repetir('Tier S', INTERVALO_DO_TIER_S_MS, () => atualizarTierS(obterBd(), liquipedia));
  else console.warn('LIQUIPEDIA_CONTATO não configurado: o quadro Tier S não vai atualizar.');
}
