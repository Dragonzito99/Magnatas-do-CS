import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { contagemDeCasos, membrosOnline } from '@/dominio/denuncias';
import { listarMembros } from '@/dominio/equipe';

/** O lugar da equipe: o Olho de Águia, os membros e as notícias saíram do menu e ficam aqui. */
export default async function PainelAdm() {
  const usuario = await exigirAcesso('/painel');
  if (!pode(usuario, 'ver_equipe')) redirect('/inicio');

  const moderar = pode(usuario, 'moderar');
  const [casos, membros, online] = await Promise.all([
    moderar ? contagemDeCasos(obterBd(), usuario) : Promise.resolve(null),
    listarMembros(obterBd()),
    membrosOnline(obterBd()),
  ]);
  const ativos = membros.filter((membro) => membro.estado === 'ativo').length;
  const abertos = casos ? casos.chamados + casos.denuncias + casos.propostas : 0;

  return (
    <>
      <div className="topo-pagina">
        <h1>Painel ADM</h1>
        <span className="apoio">Só a equipe vê esta área. Cada um vê as partes que o cargo permite.</span>
      </div>
      <div className="numeros-painel">
        <div className={abertos > 0 ? 'numero-painel alerta' : 'numero-painel'}>
          <span>Casos abertos</span>
          <b>{abertos}</b>
        </div>
        <div className="numero-painel">
          <span>Membros ativos</span>
          <b>{ativos}</b>
        </div>
        <div className="numero-painel ok">
          <span>Online agora</span>
          <b>{online.length}</b>
        </div>
      </div>
      <div className="atalhos-painel">
        {moderar && casos && (
          <Link href="/olho-de-aguia" className="atalho-painel">
            <b>Olho de Águia</b>
            <span>
              {casos.chamados} chamados · {casos.denuncias} denúncias · {casos.propostas} propostas de banimento
            </span>
          </Link>
        )}
        <Link href="/equipe" className="atalho-painel">
          <b>Membros e cargos</b>
          <span>{membros.length} contas, convites e cargos</span>
        </Link>
        {pode(usuario, 'publicar_noticia') && (
          <Link href="/equipe/noticias" className="atalho-painel">
            <b>Notícias do clube</b>
            <span>Escrever e fixar notícias na tela inicial</span>
          </Link>
        )}
      </div>
    </>
  );
}
