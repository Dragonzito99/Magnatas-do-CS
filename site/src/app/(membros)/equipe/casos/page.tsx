import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { listarBanimentosAbertos } from '@/dominio/banimentos';
import { listarCasos } from '@/dominio/denuncias';
import { Atualizar } from '../../atualizar';
import { analisar, atender } from './acoes';

const ERROS: Record<string, string> = {
  jogando: 'Você joga essa partida, então outro GM precisa atender.',
  chamado: 'Este chamado já foi atendido.',
  propria: 'Você está envolvido nessa denúncia, então outro GM precisa analisar.',
  conclusao: 'Escreva a conclusão, com até 500 caracteres.',
  denuncia: 'Esta denúncia já foi encerrada.',
};

export default async function Casos({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await exigirAcesso('/equipe/casos');
  if (!pode(usuario, 'moderar')) redirect('/salas');
  const { erro } = await searchParams;
  const [casos, propostas] = await Promise.all([listarCasos(obterBd(), usuario), listarBanimentosAbertos(obterBd(), usuario)]);

  return (
    <>
      <Atualizar segundos={5} />
      <div className="topo-pagina">
        <h1>Casos</h1>
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      <section className="painel">
        <div className="cabeca-painel">
          <h2>Chamados abertos</h2>
          <span>{casos.chamados.length}</span>
        </div>
        {casos.chamados.length === 0 && <p className="vazio">Nenhum chamado agora.</p>}
        {casos.chamados.map((chamado) => (
          <div className="linha" key={chamado.id}>
            <div>
              <Link href={`/partidas/${chamado.partidaId}`}>Partida #{chamado.partidaNumero}</Link>
              <small>Chamado por {chamado.chamadoPorApelido}</small>
            </div>
            <form action={atender}>
              <input type="hidden" name="chamadoId" value={chamado.id} />
              <button type="submit" className="botao laranja pequeno">
                Atender
              </button>
            </form>
          </div>
        ))}
      </section>
      <section className="painel">
        <div className="cabeca-painel">
          <h2>Propostas de banimento</h2>
          <span>{propostas.length}</span>
        </div>
        {propostas.length === 0 && <p className="vazio">Nenhuma proposta aberta.</p>}
        {propostas.map((proposta) => (
          <div className="caso" key={proposta.id}>
            <div>
              <b>
                <Link href={`/jogadores/${proposta.usuarioId}`}>{proposta.alvoApelido}</Link>
              </b>
              <small>Proposto por {proposta.propostoPorApelido}. A decisão fica na ficha do jogador.</small>
            </div>
            <p>{proposta.motivo}</p>
          </div>
        ))}
      </section>
      <section className="painel">
        <div className="cabeca-painel">
          <h2>Denúncias abertas</h2>
          <span>{casos.denuncias.length}</span>
        </div>
        {casos.denuncias.length === 0 && <p className="vazio">Nenhuma denúncia aberta.</p>}
        {casos.denuncias.map((denuncia) => (
          <div className="caso" key={denuncia.id}>
            <div>
              <b>
                {denuncia.acusadoId ? <Link href={`/jogadores/${denuncia.acusadoId}`}>{denuncia.acusadoApelido}</Link> : 'Acusado a definir'}
              </b>
              <small>
                Denúncia de <Link href={`/jogadores/${denuncia.denuncianteId}`}>{denuncia.denunciantePorApelido}</Link>, na{' '}
                <Link href={`/partidas/${denuncia.partidaId}`}>partida #{denuncia.partidaNumero}</Link>
              </small>
            </div>
            <p>{denuncia.motivo}</p>
            <form action={analisar}>
              <input type="hidden" name="denunciaId" value={denuncia.id} />
              <textarea name="conclusao" aria-label="Conclusão da análise" placeholder="Conclusão da análise" maxLength={500} required rows={2} />
              <button type="submit" className="botao cinza pequeno">
                Encerrar com esta conclusão
              </button>
            </form>
          </div>
        ))}
      </section>
    </>
  );
}
