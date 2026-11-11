import { z } from 'zod';
import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { conversaDiretaCom, conversaDoCla, conversasDe, SemAcessoAConversa } from '@/dominio/mensagens';

export const dynamic = 'force-dynamic';

/** As conversas de quem está logado, para a janelinha e o balão. */
export async function GET(): Promise<Response> {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.estado !== 'ativo') return new Response(null, { status: 401 });
  const conversas = await conversasDe(obterBd(), usuario.id);
  return Response.json({ conversas, naoLidas: conversas.reduce((soma, conversa) => soma + conversa.naoLidas, 0) });
}

const Pedido = z.union([z.object({ amigoId: z.uuid() }), z.object({ cla: z.literal(true) })]);

/** Abre (ou cria) a conversa com um amigo, ou a do clã. Responde com o id dela. */
export async function POST(pedido: Request): Promise<Response> {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.estado !== 'ativo') return new Response(null, { status: 401 });
  const lido = Pedido.safeParse(await pedido.json().catch(() => null));
  if (!lido.success) return new Response(null, { status: 400 });
  try {
    const id = 'amigoId' in lido.data ? await conversaDiretaCom(obterBd(), usuario, lido.data.amigoId) : await conversaDoCla(obterBd(), usuario);
    if (!id) return new Response(null, { status: 404 });
    return Response.json({ id });
  } catch (erro) {
    if (erro instanceof SemAcessoAConversa) return new Response(null, { status: 403 });
    throw erro;
  }
}
