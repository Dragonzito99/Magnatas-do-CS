import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { estatisticasDaSessao, ilhaAberta, marcarSessaoVista, type EstatisticasDaSessao } from '@/dominio/lemnos/estatisticas';

function titulo(sessao: EstatisticasDaSessao): { texto: string; detalhe: string } {
  if (sessao.fim === 'saiu') return { texto: sessao.extracoes > 0 ? 'Você extraiu da Ilha Lemnos' : 'Você saiu da Ilha Lemnos', detalhe: 'Saiu pelo posto: o que estava na mão voltou ao baú.' };
  if (sessao.fim === 'queda') return { texto: 'O servidor caiu', detalhe: 'Não foi culpa sua: as armas que estavam com você voltaram ao baú.' };
  if (sessao.fim === 'kick_afk') return { texto: 'Morreu na Ilha Lemnos', detalhe: 'Kick por ficar parado (AFK). Conta como morte.' };
  if (sessao.fim === 'kick_acampar') return { texto: 'Morreu na Ilha Lemnos', detalhe: 'Kick por acampar. Conta como morte.' };
  if (sessao.fim === 'morreu_saindo') return { texto: 'Morreu na Ilha Lemnos', detalhe: 'Saiu do servidor fora do posto: conta como morte.' };
  return { texto: 'Você está na Ilha Lemnos', detalhe: 'A sessão ainda está aberta.' };
}

const juntar = (itens: { nome: string }[]) => {
  const contagem = new Map<string, number>();
  for (const item of itens) contagem.set(item.nome, (contagem.get(item.nome) ?? 0) + 1);
  return [...contagem].map(([nome, vezes]) => (vezes > 1 ? `${nome} ×${vezes}` : nome)).join(', ');
};

/** A tela de quando o jogador sai da ilha: tempo, abates, o que guardou e o que perdeu (dono, 15/11/2026). */
export default async function SessaoDaIlha({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirAcesso('/lemnos');
  const bd = obterBd();
  if (!(await ilhaAberta(bd, usuario))) redirect('/inicio');
  const { id } = await params;
  const sessao = await estatisticasDaSessao(bd, usuario.id, id);
  if (!sessao) notFound();
  await marcarSessaoVista(bd, usuario.id, id);
  const { texto, detalhe } = titulo(sessao);

  return (
    <div className="tela-jogar ilha-lemnos">
      <div className="carteira-da-shop">
        <h1>{texto}</h1>
      </div>
      <p className="apoio">{detalhe}</p>
      <div className="numeros-da-ilha">
        <span>
          <b>{sessao.minutos}</b>
          <small>minutos</small>
        </span>
        <span>
          <b>{sessao.abates}</b>
          <small>abates</small>
        </span>
        <span>
          <b>{sessao.mortes}</b>
          <small>mortes</small>
        </span>
        <span>
          <b>{sessao.extracoes}</b>
          <small>extrações</small>
        </span>
        <span>
          <b>{sessao.granaGanha}</b>
          <small>Grana em dinheiro</small>
        </span>
        <span>
          <b>{sessao.valorDoSaque}</b>
          <small>Grana em saque</small>
        </span>
      </div>
      <div className="secao-da-shop">
        <h2>Guardou no baú</h2>
      </div>
      <p className="apoio">{sessao.guardados.length > 0 ? juntar(sessao.guardados) : 'Nada desta vez.'}</p>
      <div className="secao-da-shop">
        <h2>Perdeu</h2>
      </div>
      <p className="apoio">{sessao.perdidos.length > 0 ? juntar(sessao.perdidos) : 'Nada. Boa!'}</p>
      <p className="apoio">
        <Link className="botao-da-shop" href="/lemnos/mercado">
          Vender o saque
        </Link>{' '}
        <Link className="botao-da-shop vazado" href="/lemnos">
          Montar o kit
        </Link>
      </p>
    </div>
  );
}
