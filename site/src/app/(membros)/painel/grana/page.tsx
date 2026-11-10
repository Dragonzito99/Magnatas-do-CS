import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { buscarContasDaGrana, contaDaGrana, divergencias, extrato } from '@/dominio/grana';
import { motivoDaLinha } from '@/dominio/textos-da-grana';
import { BotaoConfirmar } from '../../botao-confirmar';
import { TelaDoPainel } from '../lateral-do-painel';
import { ajustar } from './acoes';

const ERROS: Record<string, string> = {
  ajuste: 'Escreva uma quantidade diferente de zero e um motivo com pelo menos 3 letras.',
  saldo: 'A conta não tem Grana suficiente para tirar isso.',
};
const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** A Grana no Painel ADM: buscar uma conta, ver o extrato, dar ou tirar com motivo, e o alerta da conferência. */
export default async function GranaNoPainel({ searchParams }: { searchParams: Promise<{ q?: string; conta?: string; erro?: string; aviso?: string }> }) {
  const usuario = await exigirAcesso('/painel/grana');
  if (!pode(usuario, 'ajustar_grana')) redirect('/painel');
  const { q = '', conta, erro, aviso } = await searchParams;
  const bd = obterBd();
  const contaValida = conta && z.uuid().safeParse(conta).success ? conta : null;
  const [contas, erradas, escolhida, linhas] = await Promise.all([
    buscarContasDaGrana(bd, q),
    divergencias(bd),
    contaValida ? contaDaGrana(bd, contaValida) : null,
    contaValida ? extrato(bd, contaValida) : [],
  ]);

  return (
    <TelaDoPainel usuario={usuario} atual="grana" titulo="Grana">
      {erradas.length > 0 && (
        <section role="alert" className="aviso alerta-grana">
          <b>Conferência: {erradas.length} saldo(s) não batem com o livro-caixa.</b>
          <ul>
            {erradas.map((errada) => (
              <li key={errada.usuarioId}>
                <Link href={`/painel/grana?conta=${errada.usuarioId}`}>{errada.apelido}</Link>: saldo {errada.saldo}, soma das linhas {errada.soma}
              </li>
            ))}
          </ul>
        </section>
      )}
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {aviso === 'ajustado' && <p className="aviso">Ajuste feito e registrado na auditoria.</p>}

      <form className="busca-grana" action="/painel/grana">
        <input name="q" defaultValue={q} placeholder="Apelido" aria-label="Buscar conta pelo apelido" />
        <button type="submit" className="botao cinza pequeno">
          Buscar
        </button>
      </form>
      <section className="painel">
        {contas.map((linha) => (
          <div className="linha" key={linha.id}>
            <Link href={`/painel/grana?conta=${linha.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>{linha.apelido}</Link>
            <b className="grana-destaque">{linha.grana.toLocaleString('pt-BR')} Grana</b>
          </div>
        ))}
        {contas.length === 0 && <p className="apoio linha">Nenhuma conta com esse apelido.</p>}
      </section>

      {escolhida && (
        <section className="secao-loja">
          <div className="cabeca-secao-loja">
            <h2>
              {escolhida.apelido}: {escolhida.grana.toLocaleString('pt-BR')} Grana
            </h2>
          </div>
          <form action={ajustar} className="ajuste-grana">
            <input type="hidden" name="alvo" value={escolhida.id} />
            <input name="quantidade" type="number" step={1} required className="campo-curto" aria-label="Quantidade (negativa para tirar)" placeholder="+100 ou -50" />
            <input name="motivo" required minLength={3} maxLength={200} placeholder="Motivo (fica no extrato do jogador)" aria-label="Motivo" />
            <BotaoConfirmar className="botao ouro pequeno" mensagem={`Confirmar o ajuste de Grana de ${escolhida.apelido}?`}>
              Ajustar
            </BotaoConfirmar>
          </form>
          <div className="tabela-rolavel">
            <table className="tabela-extrato">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Motivo</th>
                  <th>Grana</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={linha.id}>
                    <td>{quando.format(linha.criadoEm)}</td>
                    <td>{motivoDaLinha(linha)}</td>
                    <td className={linha.quantidade > 0 ? 'ganho' : 'gasto'}>
                      {linha.quantidade > 0 ? '+' : ''}
                      {linha.quantidade.toLocaleString('pt-BR')}
                    </td>
                    <td>{linha.saldo.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </TelaDoPainel>
  );
}
