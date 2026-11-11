import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { claDoUsuario, claPorId, membrosDoCla, pedidosFeitosPor } from '@/dominio/clas';
import { kdDosJogadores } from '@/dominio/ficha';
import { numerosDoCla, ultimasDoCla } from '@/dominio/ranking-clas';
import { BotaoConfirmar } from '../../botao-confirmar';
import { desfazer, entrar, pedir } from '../acoes';
import { BlocoDoCla, ERROS_DO_CLA } from '../bloco-do-cla';

/** A página de um clã, para quem procura ou vê a sigla em algum lugar. Quem é do clã vê também "Meu clã". */
export default async function PaginaDoCla({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { id } = await params;
  const { erro } = await searchParams;
  const usuario = await exigirAcesso(`/clas/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const bd = obterBd();
  const cla = await claPorId(bd, id);
  if (!cla) notFound();
  const [numeros, membros, ultimas, meuCla, pedidos] = await Promise.all([
    numerosDoCla(bd, cla.id),
    membrosDoCla(bd, cla.id),
    ultimasDoCla(bd, cla.id),
    claDoUsuario(bd, usuario.id),
    pedidosFeitosPor(bd, usuario.id),
  ]);
  const kd = await kdDosJogadores(
    bd,
    membros.map((membro) => membro.id),
  );
  const desfeito = !!cla.desfeitoEm;
  const souDele = meuCla?.id === cla.id;

  const botoes = desfeito ? (
    <span className="botao-da-shop vazado apagado">Clã desfeito</span>
  ) : souDele ? (
    <Link className="botao-da-shop" href="/clas?aba=meu">
      Ir para Meu clã
    </Link>
  ) : meuCla ? null : pedidos.has(cla.id) ? (
    <span className="botao-da-shop vazado apagado">Pedido enviado</span>
  ) : (
    <form action={cla.entrada === 'aberto' ? entrar : pedir}>
      <input type="hidden" name="claId" value={cla.id} />
      <button type="submit" className="botao-da-shop">
        {cla.entrada === 'aberto' ? 'Entrar no clã' : 'Pedir para entrar'}
      </button>
    </form>
  );

  return (
    <div className="tela-jogar">
      <div className="carteira-da-shop">
        <h1>Clãs</h1>
        <Link className="botao-da-shop vazado" href="/clas?aba=procurar">
          ← Procurar clãs
        </Link>
      </div>
      {erro && ERROS_DO_CLA[erro] && (
        <p role="alert" className="aviso">
          {ERROS_DO_CLA[erro]}
        </p>
      )}
      <BlocoDoCla cla={cla} numeros={numeros} membros={membros} kd={kd} ultimas={ultimas} pedidos={[]} meuCargo={null} meuId={usuario.id} botoes={botoes} />
      {!desfeito && pode(usuario, 'mudar_papel') && (
        <form action={desfazer} className="desfazer-o-cla">
          <input type="hidden" name="claId" value={cla.id} />
          <BotaoConfirmar mensagem={`Desfazer o clã [${cla.sigla}] ${cla.nome}? Todos saem dele, e isso fica na auditoria.`} className="botao-da-shop vazado">
            Desfazer clã (Adm)
          </BotaoConfirmar>
        </form>
      )}
    </div>
  );
}
