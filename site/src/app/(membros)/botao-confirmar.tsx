'use client';

/** Botão de envio que pergunta antes, para punição nenhuma sair por um clique errado. */
export function BotaoConfirmar({
  mensagem,
  className,
  formAction,
  children,
}: {
  mensagem: string;
  className: string;
  formAction?: (dados: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      onClick={(evento) => {
        if (!window.confirm(mensagem)) evento.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
