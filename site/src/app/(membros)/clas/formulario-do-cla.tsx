'use client';

import { useState } from 'react';
import type { Cla } from '@/bd/esquema';
import { BrasaoDoCla } from './brasao-do-cla';

const CORES: { valor: Cla['cor']; nome: string }[] = [
  { valor: 'ouro', nome: 'Ouro' },
  { valor: 'roxo', nome: 'Roxo' },
  { valor: 'verde', nome: 'Verde' },
  { valor: 'vermelho', nome: 'Vermelho' },
  { valor: 'prata', nome: 'Prata' },
];

type Valores = Pick<Cla, 'nome' | 'sigla' | 'cor' | 'entrada' | 'descricao'>;

/** Criar ou editar o clã, com a prévia de como ele vai aparecer, como no rascunho. */
export function FormularioDoCla({ acao, inicial, botao }: { acao: (dados: FormData) => void | Promise<void>; inicial?: Valores; botao: string }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [sigla, setSigla] = useState(inicial?.sigla ?? '');
  const [cor, setCor] = useState<Cla['cor']>(inicial?.cor ?? 'ouro');

  return (
    <div className="criar-cla">
      <div className={`previa-cla borda-cla-${cor}`}>
        <span className="rotulo-da-janela">É assim que o seu clã vai aparecer</span>
        <BrasaoDoCla cla={{ sigla: sigla.trim().toUpperCase() || 'TAG', cor }} tamanho="grande" />
        <b>
          <span className={`sigla-cla cor-cla-${cor}`}>[{sigla.trim().toUpperCase() || 'TAG'}]</span> {nome.trim() || 'Nome do clã'}
        </b>
      </div>
      <form action={acao} className="formulario-cla">
        <label>
          Nome do clã
          <input name="nome" required minLength={3} maxLength={32} value={nome} onChange={(evento) => setNome(evento.target.value)} placeholder="Magnatas Originais" />
        </label>
        <label>
          Sigla, de 2 a 4 letras ou números
          <input
            name="sigla"
            required
            minLength={2}
            maxLength={4}
            pattern="[A-Za-z0-9]{2,4}"
            value={sigla}
            onChange={(evento) => setSigla(evento.target.value)}
            placeholder="MGN"
          />
        </label>
        <fieldset className="cores-cla">
          <legend>Cor</legend>
          {CORES.map((opcao) => (
            <label key={opcao.valor} className={`cor-opcao fundo-cla-${opcao.valor}`} title={opcao.nome}>
              <input type="radio" name="cor" value={opcao.valor} checked={cor === opcao.valor} onChange={() => setCor(opcao.valor)} />
              <span className="sr-only">{opcao.nome}</span>
            </label>
          ))}
        </fieldset>
        <label>
          Quem pode entrar
          <select name="entrada" defaultValue={inicial?.entrada ?? 'aberto'}>
            <option value="aberto">Qualquer um</option>
            <option value="convite">Só com convite</option>
          </select>
        </label>
        <label>
          Descrição
          <textarea name="descricao" rows={3} maxLength={280} defaultValue={inicial?.descricao ?? ''} placeholder="Jogamos mix toda noite, às 21h." />
        </label>
        <div>
          <button type="submit" className="botao-da-shop">
            {botao}
          </button>
        </div>
      </form>
    </div>
  );
}
