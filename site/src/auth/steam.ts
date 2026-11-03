const ENDERECO_OPENID = 'https://steamcommunity.com/openid/login';
const IDENTIDADE_STEAM = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;
const IDENTIFICADOR_LIVRE = 'http://specs.openid.net/auth/2.0/identifier_select';

export function urlDeLoginSteam(retorno: string): string {
  const parametros = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': retorno,
    'openid.realm': new URL(retorno).origin,
    'openid.identity': IDENTIFICADOR_LIVRE,
    'openid.claimed_id': IDENTIFICADOR_LIVRE,
  });
  return `${ENDERECO_OPENID}?${parametros}`;
}

/** Devolve o SteamID64 só se os campos conferem e a própria Steam confirma a assinatura. */
export async function validarRetornoSteam(
  parametros: URLSearchParams,
  retornoEsperado: string,
  buscar: typeof fetch = fetch,
): Promise<string | null> {
  const identidade = parametros.get('openid.claimed_id') ?? '';
  const encontrado = IDENTIDADE_STEAM.exec(identidade);
  if (
    !encontrado ||
    parametros.get('openid.mode') !== 'id_res' ||
    parametros.get('openid.identity') !== identidade ||
    parametros.get('openid.op_endpoint') !== ENDERECO_OPENID ||
    parametros.get('openid.return_to') !== retornoEsperado
  ) {
    return null;
  }

  const confirmacao = new URLSearchParams(parametros);
  confirmacao.set('openid.mode', 'check_authentication');
  try {
    const resposta = await buscar(ENDERECO_OPENID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: confirmacao.toString(),
    });
    if (!resposta.ok) return null;
    const linhas = (await resposta.text()).split(/\r?\n/);
    return linhas.includes('is_valid:true') ? encontrado[1] : null;
  } catch {
    return null;
  }
}
