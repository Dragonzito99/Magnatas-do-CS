import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { registroDaEquipe } from '@/dominio/painel-adm';
import { TelaDoPainel } from '../lateral-do-painel';
import { NOME_DA_ACAO } from './nomes';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Os detalhes que interessam de cada ação, em uma linha. */
function resumo(detalhes: unknown): string {
  if (!detalhes || typeof detalhes !== 'object') return '';
  const campos = detalhes as Record<string, unknown>;
  const partes = [
    typeof campos.quantidade === 'number' ? `${campos.quantidade > 0 ? '+' : ''}${campos.quantidade}` : null,
    typeof campos.papel === 'string' ? `para ${campos.papel}` : null,
    typeof campos.servidor === 'string' ? campos.servidor : null,
    typeof campos.numero === 'number' ? `partida #${campos.numero}` : null,
    typeof campos.motivo === 'string' ? `“${campos.motivo}”` : null,
  ];
  return partes.filter(Boolean).join(' · ');
}

/** Tudo o que a equipe fez, o mais novo primeiro (dono, 13/11/2026). */
export default async function Registro() {
  const usuario = await exigirAcesso('/painel/registro');
  if (!pode(usuario, 'ver_equipe')) redirect('/inicio');
  const linhas = await registroDaEquipe(obterBd(), 200);

  return (
    <TelaDoPainel usuario={usuario} atual="registro" titulo="Registro da equipe" extra={<span className="apoio">as últimas {linhas.length} ações</span>}>
      <div className="tabela-adm registro-adm" role="table" aria-label="Registro da equipe">
        <div className="cabeca-da-tabela-adm" role="row">
          <span role="columnheader">Quando</span>
          <span role="columnheader">Quem</span>
          <span role="columnheader">O quê</span>
          <span role="columnheader">Em quem</span>
          <span role="columnheader">Detalhes</span>
        </div>
        {linhas.length === 0 && <p className="vazio">Nada registrado ainda.</p>}
        {linhas.map((linha) => (
          <div key={linha.id} className="linha-da-tabela-adm" role="row">
            <span role="cell">{quando.format(linha.criadoEm)}</span>
            <span role="cell">{linha.atorId ? <Link href={`/painel/usuarios/${linha.atorId}`}>{linha.atorApelido}</Link> : 'Sistema'}</span>
            <span role="cell">{NOME_DA_ACAO[linha.acao] ?? linha.acao}</span>
            <span role="cell">{linha.alvoId ? <Link href={`/painel/usuarios/${linha.alvoId}`}>{linha.alvoApelido}</Link> : '—'}</span>
            <span role="cell" className="detalhe-adm">
              {resumo(linha.detalhes)}
            </span>
          </div>
        ))}
      </div>
    </TelaDoPainel>
  );
}
