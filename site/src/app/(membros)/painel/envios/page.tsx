import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { enviosPendentes, vendasDoMes } from '@/dominio/envios';
import { TelaDoPainel } from '../lateral-do-painel';
import { marcar } from './acoes';

const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
const reais = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const NOME: Record<string, string> = { pequeno: 'Pacote pequeno', medio: 'Pacote médio', grande: 'Pacote grande', teste: 'Teste do Adm', bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', premium: 'Premium' };

/** Envios do Premium (com endereço) e as vendas do mês, para a nota fiscal. Só o Adm. */
export default async function EnviosNoPainel() {
  const usuario = await exigirAcesso('/painel/envios');
  if (!pode(usuario, 'ver_envios')) redirect('/painel');
  const bd = obterBd();
  const [pendentes, vendas] = await Promise.all([enviosPendentes(bd, usuario), vendasDoMes(bd, usuario, new Date())]);

  return (
    <TelaDoPainel usuario={usuario} atual="envios" titulo="Envios e vendas">
      <section className="secao-loja">
        <div className="cabeca-secao-loja">
          <h2>Envios pendentes ({pendentes.length})</h2>
          <p className="apoio">Produtos do clube para os assinantes do Premium. Marque quando enviar.</p>
        </div>
        {pendentes.length === 0 && <p className="apoio">Nada para enviar agora.</p>}
        {pendentes.map((envio) => (
          <div key={envio.envioId} className="caixa-da-loja envio-pendente">
            <b>
              {envio.apelido} · desde {data.format(envio.criadoEm)}
            </b>
            {envio.endereco ? (
              <address>
                {envio.endereco.nome}
                <br />
                {envio.endereco.rua}, {envio.endereco.numero}
                {envio.endereco.complemento ? ` - ${envio.endereco.complemento}` : ''}
                <br />
                {envio.endereco.bairro}, {envio.endereco.cidade} - {envio.endereco.uf}, CEP {envio.endereco.cep}
                <br />
                Telefone: {envio.endereco.telefone}
              </address>
            ) : (
              <p className="aviso">Ainda sem endereço cadastrado.</p>
            )}
            <form action={marcar} className="ajuste-grana">
              <input type="hidden" name="envio" value={envio.envioId} />
              <input name="rastreio" maxLength={60} placeholder="Código de rastreio" aria-label={`Rastreio do envio de ${envio.apelido}`} />
              <button type="submit" className="botao ouro pequeno" disabled={!envio.endereco}>
                Marcar como enviado
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="secao-loja">
        <div className="cabeca-secao-loja">
          <h2>Vendas do mês: {reais(vendas.totalCentavos)}</h2>
          <p className="apoio">Pacotes de MagCoin e mensalidades aprovados neste mês, para a nota fiscal.</p>
        </div>
        <div className="tabela-rolavel">
          <table className="tabela-extrato">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>O quê</th>
                <th>Valor</th>
                <th>Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {vendas.linhas.map((linha) => (
                <tr key={`${linha.tipo}-${linha.pagamento}`}>
                  <td>{data.format(linha.quando)}</td>
                  <td>{linha.apelido}</td>
                  <td>
                    {linha.tipo}: {NOME[linha.descricao] ?? linha.descricao}
                    {linha.estornado ? ' (estornado)' : ''}
                  </td>
                  <td>{reais(linha.valorCentavos)}</td>
                  <td className="mono">{linha.pagamento}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </TelaDoPainel>
  );
}
