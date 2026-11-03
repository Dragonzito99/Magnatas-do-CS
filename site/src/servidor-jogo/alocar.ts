import type { Bd } from '@/bd/conexao';
import { alocarServidores } from '@/dominio/partidas';
import { controladorDoAmbiente } from './controlador';

/** Não espera o servidor de jogo, para quem clicou não ficar parado se ele estiver fora do ar. */
export function alocarEmSegundoPlano(bd: Bd): void {
  alocarServidores(bd, controladorDoAmbiente()).catch((erro) => {
    console.error('Falha ao alocar servidores:', erro);
  });
}
