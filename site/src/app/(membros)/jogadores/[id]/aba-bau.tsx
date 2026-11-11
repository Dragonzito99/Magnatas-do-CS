import type { Usuario } from '@/bd/esquema';
import { NOME_DO_TIPO, type ItemDoBau, type TipoDeItem } from '@/dominio/loja';
import { PreviaDoItem } from '../../loja/previa-do-item';

const ORDEM: TipoDeItem[] = ['mutante', 'moldura', 'etiqueta', 'aviso', 'cor'];

/** A aba Baú: a vitrine do que a pessoa tem, aberta para quem visita (dono, 11/11/2026). Vencidos não aparecem. */
export function AbaBau({ itens, jogador }: { itens: ItemDoBau[]; jogador: Pick<Usuario, 'apelido' | 'avatarUrl'> }) {
  const valendo = itens.filter((posse) => !posse.vencido);
  if (valendo.length === 0) return <p className="vazio painel perfil-bau-vazio">Nenhum item no Baú ainda.</p>;
  return (
    <div className="perfil-bau">
      {ORDEM.map((tipo) => {
        const doTipo = valendo.filter((posse) => posse.item.tipo === tipo);
        if (doTipo.length === 0) return null;
        return (
          <section className="painel" key={tipo}>
            <div className="cabeca-painel">
              <h2>{NOME_DO_TIPO[tipo]}</h2>
              <span>{doTipo.length}</span>
            </div>
            <div className="perfil-vitrine">
              {doTipo.map((posse) => (
                <div className={posse.usando ? 'perfil-item usando' : 'perfil-item'} key={posse.item.id}>
                  <span className="perfil-item-previa">
                    <PreviaDoItem item={posse.item} usuario={jogador} />
                  </span>
                  <b>{posse.item.nome}</b>
                  {posse.usando && <small className="perfil-em-uso">Em uso</small>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
