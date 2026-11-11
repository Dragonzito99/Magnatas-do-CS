import { faltamParaAProxima, NOMES_DOS_NIVEIS, nomeDaInsignia, textoDoPremio, type ChaveDaInsignia, type InsigniaDaFamilia } from '@/dominio/insignias';
import { Insignia } from '../../insignia';
import { escolherInsignia } from './acoes';
import { MarcarInsigniasVistas } from './marcar-insignias-vistas';

const numero = new Intl.NumberFormat('pt-BR');
const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

/**
 * A aba Insígnias: um resumo e uma linha por família, do Bronze à Lendária, com a barra até a próxima. No próprio
 * perfil, clicar numa conquistada a torna a principal (estrela). Rascunho aprovado pelo dono em 11/11/2026.
 */
export function AbaInsignias({ familias, principal, total, proprio, temNovas }: { familias: InsigniaDaFamilia[]; principal: ChaveDaInsignia | null; total: number; proprio: boolean; temNovas: boolean }) {
  const maisAlta = familias.reduce((maior, familia) => Math.max(maior, familia.nivel), -1);
  const quantasNoMaisAlto = familias.filter((familia) => familia.nivel === maisAlta).length;
  // A que já bateu a meta e só espera a próxima conferência não conta como "a mais perto".
  const maisPerto = familias
    .filter((familia) => familia.proximaMeta !== null && (faltamParaAProxima(familia) ?? 0) > 0)
    .map((familia) => ({ familia, faltam: faltamParaAProxima(familia) ?? 0, parte: familia.contagem / familia.proximaMeta! }))
    .sort((a, b) => b.parte - a.parte)[0];

  return (
    <div className="perfil-insignias">
      {proprio && temNovas && <MarcarInsigniasVistas />}
      <div className="perfil-resumo">
        <div>
          <b>{total} de 30</b>
          <span>insígnias conquistadas</span>
        </div>
        <div>
          <b>{maisAlta < 0 ? 'Nenhuma' : `${quantasNoMaisAlto} ${NOMES_DOS_NIVEIS[maisAlta]}`}</b>
          <span>o nível mais alto até agora</span>
        </div>
        <div>
          <b>{maisPerto ? nomeDaInsignia(maisPerto.familia.familia, maisPerto.familia.nivel + 1) : 'Todas completas'}</b>
          <span>{maisPerto ? `a mais perto: faltam ${numero.format(maisPerto.faltam)} ${maisPerto.familia.conta}` : 'não falta nenhuma'}</span>
        </div>
      </div>
      {proprio && <p className="apoio">Clique numa insígnia conquistada para ela aparecer ao lado do seu nome.</p>}

      {familias.map((familia) => {
        const anterior = familia.nivel >= 0 ? familia.metas[familia.nivel] : 0;
        const parte = familia.proximaMeta === null ? 100 : Math.min(100, Math.floor(((familia.contagem - anterior) / (familia.proximaMeta - anterior)) * 100));
        return (
          <section className="painel perfil-familia" key={familia.familia}>
            <div className="perfil-familia-texto">
              <h2>{familia.nome}</h2>
              <p>
                {numero.format(familia.contagem)} {familia.conta}
              </p>
              <span className="perfil-mapa-barra">
                <i style={{ width: `${Math.max(parte, 0)}%` }} />
              </span>
              <small>
                {familia.proximaMeta === null
                  ? 'Completa'
                  : faltamParaAProxima(familia) === 0
                    ? `${NOMES_DOS_NIVEIS[familia.nivel + 1]} sai na próxima partida`
                    : `Faltam ${numero.format(faltamParaAProxima(familia)!)} para ${NOMES_DOS_NIVEIS[familia.nivel + 1]}`}
              </small>
            </div>
            <div className="perfil-niveis">
              {familia.metas.map((meta, nivel) => {
                const tem = nivel <= familia.nivel;
                const escolhida = principal?.familia === familia.familia && principal.nivel === nivel;
                // O prêmio fica guardado na insígnia e aparece aqui (spec; revisão de 11/11/2026).
                const conquistada = familia.conquistadas.find((item) => item.nivel === nivel);
                const conteudo = (
                  <>
                    <Insignia familia={familia.familia} nivel={nivel} tamanho={64} apagada={!tem} />
                    <b>
                      {NOMES_DOS_NIVEIS[nivel]}
                      {escolhida && ' ★'}
                    </b>
                    <small>{numero.format(meta)}</small>
                    {conquistada && (
                      <small className="perfil-premio">
                        {textoDoPremio(conquistada)} · {dataCurta.format(conquistada.conquistadaEm)}
                      </small>
                    )}
                  </>
                );
                if (proprio && tem && !escolhida) {
                  return (
                    <form action={escolherInsignia} key={nivel} className="perfil-nivel">
                      <input type="hidden" name="familia" value={familia.familia} />
                      <input type="hidden" name="nivel" value={nivel} />
                      <button type="submit" title={`Usar ${nomeDaInsignia(familia.familia, nivel)} ao lado do nome`}>
                        {conteudo}
                      </button>
                    </form>
                  );
                }
                return (
                  <div key={nivel} className={escolhida ? 'perfil-nivel escolhida' : 'perfil-nivel'}>
                    {conteudo}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
