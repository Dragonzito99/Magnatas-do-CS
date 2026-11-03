export interface PerfilSteam {
  apelido: string;
  avatarUrl?: string;
}

const AVATAR_DA_STEAM = /^https:\/\/avatars\.([a-z0-9-]+\.)?steamstatic\.com\//;

function campo(xml: string, nome: string): string | undefined {
  return new RegExp(`<${nome}><!\\[CDATA\\[(.*?)\\]\\]></${nome}>`, 's').exec(xml)?.[1];
}

/** Lê o nome e o avatar públicos. Falhar aqui não pode impedir a entrada, então o SteamID vira o apelido. */
export async function perfilPublicoSteam(steamid64: string, buscar: typeof fetch = fetch): Promise<PerfilSteam> {
  try {
    const resposta = await buscar(`https://steamcommunity.com/profiles/${steamid64}?xml=1`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) return { apelido: steamid64 };
    const xml = await resposta.text();
    const apelido = campo(xml, 'steamID')?.trim();
    if (!apelido) return { apelido: steamid64 };
    const avatar = campo(xml, 'avatarFull');
    return avatar && AVATAR_DA_STEAM.test(avatar) ? { apelido, avatarUrl: avatar } : { apelido };
  } catch {
    return { apelido: steamid64 };
  }
}
