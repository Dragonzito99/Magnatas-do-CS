import { z } from 'zod';
import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { denunciarMensagem, enviarMensagem, mensagensDe, MensagemInvalida, SemAcessoAConversa, TAMANHO_MAXIMO_DA_MENSAGEM } from '@/dominio/mensagens';

export const dynamic = 'force-dynamic';

const Id = z.uuid();

function recusa(erro: unknown): Response {
  if (erro instanceof SemAcessoAConversa) return new Response(null, { status: 403 });
  if (erro instanceof MensagemInvalida) return new Response(null, { status: 400 });
  throw erro;
}

/** As últimas mensagens da conversa (e marca como lidas). */
export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.estado !== 'ativo') return new Response(null, { status: 401 });
  const { id } = await params;
  if (!Id.safeParse(id).success) return new Response(null, { status: 404 });
  try {
    return Response.json({ eu: usuario.id, mensagens: await mensagensDe(obterBd(), usuario, id) });
  } catch (erro) {
    return recusa(erro);
  }
}

const Pedido = z.union([z.object({ texto: z.string().max(TAMANHO_MAXIMO_DA_MENSAGEM * 2) }), z.object({ denunciar: z.uuid() })]);

/** Manda uma mensagem, ou denuncia uma mensagem da conversa. */
export async function POST(pedido: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.estado !== 'ativo') return new Response(null, { status: 401 });
  const { id } = await params;
  const lido = Pedido.safeParse(await pedido.json().catch(() => null));
  if (!Id.safeParse(id).success || !lido.success) return new Response(null, { status: 400 });
  try {
    if ('denunciar' in lido.data) {
      await denunciarMensagem(obterBd(), usuario, lido.data.denunciar);
      return Response.json({ ok: true });
    }
    return Response.json({ id: await enviarMensagem(obterBd(), usuario, id, lido.data.texto) });
  } catch (erro) {
    return recusa(erro);
  }
}
