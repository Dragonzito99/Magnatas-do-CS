import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { comMemoriaDoEstado, destinoAoSair, servidoresDaDiversaoLigados } from '@/dominio/avaliar';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';

export const dynamic = 'force-dynamic';

// Uma leitura por servidor a cada 10 s, por mais abas que perguntem.
let controlador: ReturnType<typeof comMemoriaDoEstado> | null = null;
const controladorComMemoria = () => (controlador ??= comMemoriaDoEstado(controladorDoAmbiente(), 10_000));

/** A aba de quem acabou de jogar pergunta aqui para onde ir: a página da partida para avaliar, ou nada ainda. */
export async function GET(): Promise<Response> {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.estado !== 'ativo') return new Response(null, { status: 401 });
  const bd = obterBd();
  const servidores = await servidoresDaDiversaoLigados(bd, process.env.DIVERSAO_HOST);
  const ir = await destinoAoSair(bd, controladorComMemoria(), usuario, servidores);
  return Response.json({ ir }, { headers: { 'Cache-Control': 'no-store' } });
}
