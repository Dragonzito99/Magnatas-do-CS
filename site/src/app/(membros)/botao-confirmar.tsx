'use client';

/** Botão de envio que pergunta antes, para punição nenhuma sair por um clique errado. */
export function BotaoConfirmar({ mensagem, className, children }: { mensagem: string; className: string; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(evento) => {
        if (!window.confirm(mensagem)) evento.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
