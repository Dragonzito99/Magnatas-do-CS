'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENTO_AO_VIVO } from './ao-vivo';

type Alvo = { amigoId: string } | { conversaId: string } | { cla: true } | { lista: true };
type Resumo = { id: string; tipo: 'direta' | 'grupo' | 'cla'; nome: string; avatarUrl: string | null; outroId: string | null; ultima: string | null; naoLidas: number };
type Mensagem = { id: string; autorId: string; autorApelido: string; texto: string; criadoEm: string };

const EVENTO = 'magnatas:abrir-conversa';
const GUARDADA = 'magnatas:conversa-aberta';
const SEGUNDOS_ENTRE_BUSCAS = 10;
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Abre a janelinha de conversa de qualquer lugar do site (barra de amigos, Comunidade, perfil). */
export function abrirConversa(alvo: Alvo) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: alvo }));
}

/** Botão que abre a conversa: um amigo, um grupo, o clã ou a lista de conversas. */
export function BotaoDeConversa({ alvo, className, title, children }: { alvo: Alvo; className?: string; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} title={title} onClick={() => abrirConversa(alvo)}>
      {children}
    </button>
  );
}

/**
 * A janelinha de conversa no canto, como na GC (dono, 11/11/2026). Fica aberta ao trocar de página; a mensagem nova
 * aparece na hora pelo aviso ao vivo, e a cada 10 segundos ela confere de novo, por garantia.
 */
export function JanelaDeConversa() {
  const [aberta, setAberta] = useState<string | null>(null);
  const [lista, setLista] = useState<Resumo[] | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [eu, setEu] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [minimizada, setMinimizada] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const buscarLista = useCallback(async () => {
    const resposta = await fetch('/api/conversas', { cache: 'no-store' });
    if (resposta.ok) setLista((await resposta.json()).conversas);
  }, []);

  const buscarMensagens = useCallback(async (id: string) => {
    const resposta = await fetch(`/api/conversas/${id}`, { cache: 'no-store' });
    if (!resposta.ok) {
      setErro(resposta.status === 403 ? 'Você não está mais nessa conversa.' : 'Não deu para carregar a conversa.');
      return;
    }
    const dados = await resposta.json();
    setEu(dados.eu);
    setMensagens(dados.mensagens);
    setErro(null);
  }, []);

  const abrir = useCallback(
    async (alvo: Alvo) => {
      setMinimizada(false);
      if ('lista' in alvo) {
        setAberta(null);
        setMensagens([]);
        await buscarLista();
        return;
      }
      let id = 'conversaId' in alvo ? alvo.conversaId : null;
      if (!id) {
        const resposta = await fetch('/api/conversas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alvo) });
        if (!resposta.ok) {
          setErro('Só dá para conversar com amigos.');
          return;
        }
        id = (await resposta.json()).id as string;
      }
      if (!lista) await buscarLista();
      setAberta(id);
      try {
        sessionStorage.setItem(GUARDADA, id);
      } catch {}
      await buscarMensagens(id);
    },
    [buscarLista, buscarMensagens, lista],
  );

  useEffect(() => {
    const aoPedir = (evento: Event) => void abrir((evento as CustomEvent<Alvo>).detail);
    window.addEventListener(EVENTO, aoPedir);
    return () => window.removeEventListener(EVENTO, aoPedir);
  }, [abrir]);

  // Ao recarregar a página, a conversa que estava aberta volta.
  useEffect(() => {
    let guardada: string | null = null;
    try {
      guardada = sessionStorage.getItem(GUARDADA);
    } catch {}
    if (!guardada) return;
    const reabrir = setTimeout(() => void abrir({ conversaId: guardada }), 0);
    return () => clearTimeout(reabrir);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na primeira vez
  }, []);

  useEffect(() => {
    if (!aberta || minimizada) return;
    const relogio = setInterval(() => void buscarMensagens(aberta), SEGUNDOS_ENTRE_BUSCAS * 1000);
    return () => clearInterval(relogio);
  }, [aberta, minimizada, buscarMensagens]);

  // A mensagem nova chega na hora pelo aviso ao vivo; a busca de tempos em tempos fica só de reserva.
  useEffect(() => {
    const aoReceber = (evento: Event) => {
      const novidade = (evento as CustomEvent<{ tipo: string; conversaId?: string }>).detail;
      if (aberta && !minimizada && novidade.tipo === 'mensagem' && novidade.conversaId === aberta) void buscarMensagens(aberta);
      if (!aberta && lista && (novidade.tipo === 'mensagem' || novidade.tipo === 'conversas')) void buscarLista();
    };
    window.addEventListener(EVENTO_AO_VIVO, aoReceber);
    return () => window.removeEventListener(EVENTO_AO_VIVO, aoReceber);
  }, [aberta, minimizada, lista, buscarMensagens, buscarLista]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length, aberta]);

  function fechar() {
    setAberta(null);
    setLista(null);
    setMensagens([]);
    try {
      sessionStorage.removeItem(GUARDADA);
    } catch {}
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!aberta || !texto.trim()) return;
    const enviado = texto;
    setTexto('');
    const resposta = await fetch(`/api/conversas/${aberta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: enviado }) });
    if (!resposta.ok) {
      setTexto(enviado);
      setErro(resposta.status === 400 ? 'A mensagem precisa ter de 1 a 1000 letras.' : 'Não deu para mandar a mensagem.');
      return;
    }
    await buscarMensagens(aberta);
  }

  async function denunciar(mensagemId: string) {
    if (!aberta || !window.confirm('Denunciar esta mensagem para a equipe?')) return;
    await fetch(`/api/conversas/${aberta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ denunciar: mensagemId }) });
    setErro('Denúncia enviada para a equipe.');
  }

  if (!aberta && !lista) return null;
  const atual = lista?.find((conversa) => conversa.id === aberta);

  return (
    <section className={minimizada ? 'janela-de-conversa minimizada' : 'janela-de-conversa'} aria-label="Conversa">
      <header>
        {aberta && (
          <button type="button" className="voltar-da-conversa" onClick={() => void abrir({ lista: true })} aria-label="Ver todas as conversas">
            ‹
          </button>
        )}
        <span className="titulo-da-conversa">
          {aberta ? (
            atual?.outroId ? (
              <Link href={`/jogadores/${atual.outroId}`}>{atual.nome}</Link>
            ) : (
              (atual?.nome ?? 'Conversa')
            )
          ) : (
            'Mensagens'
          )}
        </span>
        <button type="button" onClick={() => setMinimizada(!minimizada)} aria-label={minimizada ? 'Abrir' : 'Minimizar'}>
          {minimizada ? '▴' : '—'}
        </button>
        <button type="button" onClick={fechar} aria-label="Fechar">
          ✕
        </button>
      </header>
      {!minimizada && !aberta && (
        <ul className="lista-de-conversas">
          {lista?.length === 0 && <li className="sem-conversa">Nenhuma conversa ainda. Clique num amigo na barra para começar.</li>}
          {lista?.map((conversa) => (
            <li key={conversa.id}>
              <button type="button" onClick={() => void abrir({ conversaId: conversa.id })}>
                <b>{conversa.nome}</b>
                <small>{conversa.ultima ?? (conversa.tipo === 'cla' ? 'Grupo do clã' : 'Sem mensagens ainda')}</small>
                {conversa.naoLidas > 0 && <em>{conversa.naoLidas}</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!minimizada && aberta && (
        <>
          <div className="mensagens-da-conversa">
            {mensagens.length === 0 && <p className="sem-conversa">Nenhuma mensagem ainda. Diga oi!</p>}
            {mensagens.map((mensagem) => (
              <div key={mensagem.id} className={mensagem.autorId === eu ? 'balao-de-mensagem meu' : 'balao-de-mensagem'}>
                {mensagem.autorId !== eu && atual?.tipo !== 'direta' && <b>{mensagem.autorApelido}</b>}
                <span>{mensagem.texto}</span>
                <small>
                  {hora.format(new Date(mensagem.criadoEm))}
                  {mensagem.autorId !== eu && (
                    <button type="button" onClick={() => void denunciar(mensagem.id)}>
                      denunciar
                    </button>
                  )}
                </small>
              </div>
            ))}
            <div ref={fim} />
          </div>
          {erro && <p className="erro-da-conversa">{erro}</p>}
          <form className="escrever-mensagem" onSubmit={enviar}>
            <input value={texto} onChange={(evento) => setTexto(evento.target.value)} maxLength={1000} placeholder="Escreva uma mensagem" aria-label="Mensagem" />
            <button type="submit" className="botao-da-shop">
              Enviar
            </button>
          </form>
        </>
      )}
    </section>
  );
}
