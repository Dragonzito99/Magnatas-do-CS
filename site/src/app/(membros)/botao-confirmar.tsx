'use client';

/** Botão de envio que pergunta antes, para punição nenhuma sair por um clique errado. */
export function BotaoConfirmar({
  mensagem,
  className,
  formAction,
  name,
  value,
  children,
}: {
  mensagem: string;
  className: string;
  formAction?: (dados: FormData) => void | Promise<void>;
  /** Para o botão levar um valor no envio, como os dias de uma compra. */
  name?: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      name={name}
      value={value}
      onClick={(evento) => {
        if (!window.confirm(mensagem)) evento.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
