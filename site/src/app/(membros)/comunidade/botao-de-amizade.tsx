import type { SituacaoDaAmizade } from '@/dominio/amigos';
import { pedir, responder } from './acoes';

/** O botão de amizade de um membro, conforme a situação: adicionar, aceitar, pedido enviado ou já amigos. */
export function BotaoDeAmizade({ usuarioId, situacao, voltar }: { usuarioId: string; situacao: SituacaoDaAmizade; voltar: string }) {
  if (situacao === 'amigos') return <span className="botao-da-shop vazado apagado">Amigos ✓</span>;
  if (situacao === 'pedido_enviado') return <span className="botao-da-shop vazado apagado">Pedido enviado</span>;
  return (
    <form action={situacao === 'pedido_recebido' ? responder : pedir}>
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <input type="hidden" name="voltar" value={voltar} />
      {situacao === 'pedido_recebido' && <input type="hidden" name="resposta" value="aceitar" />}
      <button type="submit" className="botao-da-shop">
        {situacao === 'pedido_recebido' ? 'Aceitar amizade' : '+ Adicionar amigo'}
      </button>
    </form>
  );
}
