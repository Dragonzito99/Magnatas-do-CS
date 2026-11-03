import type { Banimento, EstadoUsuario, Papel } from '@/bd/esquema';
import { BotaoConfirmar } from '../../botao-confirmar';
import { confirmarBan, liberarConta, proporBan, recusarBan, reverterBan, suspenderConta } from './acoes';

const NOME_DO_BANIMENTO: Record<Banimento['estado'], string> = {
  proposto: 'Proposta aberta',
  confirmado: 'Banido',
  recusado: 'Proposta recusada',
  revertido: 'Revertido',
};

type BanimentoDaFicha = Pick<Banimento, 'id' | 'estado' | 'motivo' | 'motivoReversao'> & { propostoPorApelido: string };

function FormularioComMotivo({
  acao,
  jogadorId,
  banimentoId,
  rotulo,
  dica,
  aviso,
  destaque,
}: {
  acao: (dados: FormData) => Promise<void>;
  jogadorId: string;
  banimentoId?: string;
  rotulo: string;
  dica: string;
  aviso: string;
  destaque?: boolean;
}) {
  return (
    <form action={acao}>
      <input type="hidden" name="jogadorId" value={jogadorId} />
      {banimentoId && <input type="hidden" name="banimentoId" value={banimentoId} />}
      <textarea name="motivo" aria-label={dica} placeholder={dica} maxLength={500} required rows={2} />
      <BotaoConfirmar mensagem={aviso} className={destaque ? 'botao laranja pequeno' : 'botao cinza pequeno'}>
        {rotulo}
      </BotaoConfirmar>
    </form>
  );
}

export function Punicoes({
  jogadorId,
  apelido,
  papel,
  estado,
  banimentos,
  ehProprio,
  leitorEhAdm,
}: {
  jogadorId: string;
  apelido: string;
  papel: Papel;
  estado: EstadoUsuario;
  banimentos: BanimentoDaFicha[];
  ehProprio: boolean;
  leitorEhAdm: boolean;
}) {
  const podeAgir = !ehProprio && (papel !== 'adm' || leitorEhAdm);
  const temProposta = banimentos.some((banimento) => banimento.estado === 'proposto');

  return (
    <section className="painel">
      <div className="cabeca-painel">
        <h2>Suspensão e banimento</h2>
        <span>Tudo fica registrado</span>
      </div>
      {podeAgir && estado === 'ativo' && (
        <div className="caso">
          <small>Tira da partida na hora e bloqueia a conta até um Adm decidir.</small>
          <FormularioComMotivo
            acao={suspenderConta}
            jogadorId={jogadorId}
            rotulo="Suspender"
            dica="Motivo da suspensão"
            aviso={`Suspender ${apelido} agora? A pessoa sai da partida e fica sem acesso até um Adm decidir.`}
          />
        </div>
      )}
      {podeAgir && estado === 'suspenso' && leitorEhAdm && (
        <div className="caso">
          <small>Devolve o acesso à conta.</small>
          <FormularioComMotivo
            acao={liberarConta}
            jogadorId={jogadorId}
            rotulo="Liberar suspensão"
            dica="Motivo da liberação"
            aviso={`Liberar a suspensão de ${apelido}?`}
          />
        </div>
      )}
      {podeAgir && estado !== 'banido' && !temProposta && (
        <div className="caso">
          <small>Só depois de analisar várias partidas e denúncias. Um Adm confirma.</small>
          <FormularioComMotivo
            acao={proporBan}
            jogadorId={jogadorId}
            rotulo="Propor banimento"
            dica="Quais partidas e provas sustentam o banimento?"
            aviso={`Propor o banimento de ${apelido}?`}
          />
        </div>
      )}
      {banimentos.length === 0 && !podeAgir && <p className="vazio">Nenhum registro.</p>}
      {banimentos.map((banimento) => (
        <div className="caso" key={banimento.id}>
          <div>
            <b>{NOME_DO_BANIMENTO[banimento.estado]}</b>
            <small>Proposto por {banimento.propostoPorApelido}</small>
          </div>
          <p>{banimento.motivo}</p>
          {banimento.motivoReversao && <span className="apoio">Motivo da reversão: {banimento.motivoReversao}</span>}
          {leitorEhAdm && banimento.estado === 'proposto' && (
            <>
              <form action={confirmarBan}>
                <input type="hidden" name="jogadorId" value={jogadorId} />
                <input type="hidden" name="banimentoId" value={banimento.id} />
                <BotaoConfirmar
                  mensagem={`Banir ${apelido} de vez? A conta e o CPF ficam bloqueados, e só volta com erro provado.`}
                  className="botao laranja pequeno"
                >
                  Confirmar banimento
                </BotaoConfirmar>
              </form>
              <FormularioComMotivo
                acao={recusarBan}
                jogadorId={jogadorId}
                banimentoId={banimento.id}
                rotulo="Recusar proposta"
                dica="Por que a proposta foi recusada?"
                aviso="Recusar esta proposta de banimento?"
              />
            </>
          )}
          {leitorEhAdm && banimento.estado === 'confirmado' && (
            <FormularioComMotivo
              acao={reverterBan}
              jogadorId={jogadorId}
              banimentoId={banimento.id}
              rotulo="Reverter banimento"
              dica="Qual erro foi provado?"
              aviso={`Reverter o banimento de ${apelido}? Só em caso de erro provado.`}
            />
          )}
        </div>
      ))}
    </section>
  );
}
