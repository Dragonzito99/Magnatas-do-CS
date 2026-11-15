import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { nomeLemnos, raridadeLemnos } from '@/dominio/lemnos/catalogo';
import { estatisticasDaSessao, ilhaAberta, marcarSessaoVista, type EstatisticasDaSessao } from '@/dominio/lemnos/estatisticas';
import { AbasDaIlha, ImagemDoItem } from '../../componentes';

function titulo(sessao: EstatisticasDaSessao): { texto: string; detalhe: string; bom: boolean } {
  if (sessao.fim === 'saiu')
    return sessao.extracoes > 0
      ? { texto: 'Você extraiu da Ilha Lemnos', detalhe: 'Saiu pelo posto: o saque está no baú e as armas na mão voltaram com você.', bom: true }
      : { texto: 'Você saiu da Ilha Lemnos', detalhe: 'Saiu pelo posto: as armas na mão voltaram ao baú.', bom: true };
  if (sessao.fim === 'queda') return { texto: 'O servidor caiu', detalhe: 'Não foi culpa sua: as armas que estavam com você voltaram ao baú.', bom: true };
  if (sessao.fim === 'kick_afk') return { texto: 'Morreu na Ilha Lemnos', detalhe: 'Kick por ficar parado (AFK). Conta como morte.', bom: false };
  if (sessao.fim === 'kick_acampar') return { texto: 'Morreu na Ilha Lemnos', detalhe: 'Kick por acampar. Conta como morte.', bom: false };
  if (sessao.fim === 'morreu_saindo') return { texto: 'Morreu na Ilha Lemnos', detalhe: 'Saiu do servidor fora do posto: conta como morte.', bom: false };
  return { texto: 'Você está na Ilha Lemnos', detalhe: 'A sessão ainda está aberta.', bom: true };
}

/** Os itens iguais juntos, com "×3", cada um com a foto. */
function Itens({ itens, vazio }: { itens: { itemId: string }[]; vazio: string }) {
  if (itens.length === 0) return <p className="apoio">{vazio}</p>;
  const contagem = new Map<string, number>();
  for (const item of itens) contagem.set(item.itemId, (contagem.get(item.itemId) ?? 0) + 1);
  return (
    <div className="grade-da-shop quatro">
      {[...contagem].map(([itemId, vezes]) => (
        <div key={itemId} className={`cartao-da-shop raridade-${raridadeLemnos(itemId)}`}>
          <span className="palco-do-cartao">
            <ImagemDoItem id={itemId} />
            {vezes > 1 && <span className="tenho-do-cartao">×{vezes}</span>}
          </span>
          <span className="dados-do-cartao">
            <b className="nome-do-cartao">{nomeLemnos(itemId)}</b>
          </span>
        </div>
      ))}
    </div>
  );
}

/** A tela de quando o jogador sai da ilha: o resultado em destaque, os números, o que guardou e o que perdeu (dono, 15/11/2026). */
export default async function SessaoDaIlha({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirAcesso('/lemnos');
  const bd = obterBd();
  if (!(await ilhaAberta(bd, usuario))) redirect('/inicio');
  const { id } = await params;
  const sessao = await estatisticasDaSessao(bd, usuario.id, id);
  if (!sessao) notFound();
  await marcarSessaoVista(bd, usuario.id, id);
  const { texto, detalhe, bom } = titulo(sessao);

  return (
    <div className="tela-jogar ilha-lemnos">
      <AbasDaIlha atual="kit" />
      <section className={bom ? 'resultado-da-ilha extraiu' : 'resultado-da-ilha morreu'}>
        <span className="selo-da-raridade">Ilha Lemnos · {sessao.minutos} minutos</span>
        <h1>{texto}</h1>
        <p>{detalhe}</p>
        <div className="numeros-da-ilha">
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
            <b>+{sessao.granaGanha}</b>
            <small>Grana em dinheiro</small>
          </span>
          <span>
            <b>{sessao.valorDoSaque}</b>
            <small>Grana em saque para vender</small>
          </span>
        </div>
      </section>

      <div className="secao-da-shop">
        <h2>Guardou no baú</h2>
      </div>
      <Itens itens={sessao.guardados} vazio="Nada desta vez. Na próxima, chegue a uma saída e fique parado 10 segundos." />
      <div className="secao-da-shop">
        <h2>Perdeu na ilha</h2>
      </div>
      <Itens itens={sessao.perdidos} vazio="Nada. Boa!" />

      <div className="acoes-do-destaque">
        {sessao.valorDoSaque > 0 && (
          <Link className="botao-da-shop" href="/lemnos/mercado?aba=vender">
            Vender o saque
          </Link>
        )}
        <Link className="botao-da-shop vazado" href="/lemnos">
          Montar o kit e voltar
        </Link>
      </div>
    </div>
  );
}
