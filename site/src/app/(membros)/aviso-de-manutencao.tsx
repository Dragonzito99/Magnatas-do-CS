/** A faixa do topo enquanto os servidores esperam a correção depois de uma atualização do CS2 (dono, 11/11/2026). */
export function AvisoDeManutencao() {
  return (
    <div className="aviso-de-manutencao" role="status">
      <div className="largura">
        <span className="icone-da-manutencao" aria-hidden="true">
          ⚙
        </span>
        <div>
          <b>Servidores em manutenção</b>
          <small>O CS2 foi atualizado e estamos esperando a correção para voltar. Mix e Diversão voltam assim que possível.</small>
        </div>
        <span className="ponto-da-manutencao" aria-hidden="true" />
      </div>
    </div>
  );
}

/** No lugar dos botões de jogar enquanto os servidores estão em manutenção. */
export function AguardandoAtualizacao({ curto = false }: { curto?: boolean }) {
  return <span className="aguardando-atualizacao">{curto ? 'Aguardando atualização' : 'Aguardando atualização do servidor'}</span>;
}
