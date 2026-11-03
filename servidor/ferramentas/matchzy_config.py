"""Grava no config.cfg do MatchZy os endereços do site, sem deixar o token no repositório.

Uso: matchzy_config.py <config.cfg> <arquivo .env com SITE_URL e SERVIDOR_TOKEN>
"""
import pathlib
import re
import sys

CONTROLADOS = (
    "matchzy_whitelist_enabled_default",
    "matchzy_kick_when_no_match_loaded",
    "matchzy_demo_path",
    "matchzy_demo_upload_url",
    "matchzy_remote_log_url",
    "matchzy_remote_log_header_key",
    "matchzy_remote_log_header_value",
)
MARCA = "// Magnatas: gerado por matchzy_config.py"


def aplicar(texto, site_url, token):
    if not site_url.startswith(("http://", "https://")):
        raise ValueError("SITE_URL precisa começar com http:// ou https://")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", token):
        raise ValueError("SERVIDOR_TOKEN só pode ter letras, números, _ e -")
    site = site_url.rstrip("/")
    linhas = [
        linha
        for linha in texto.splitlines()
        if linha.strip() != MARCA and (linha.split() or [""])[0] not in CONTROLADOS
    ]
    while linhas and not linhas[-1].strip():
        linhas.pop()
    return "\n".join(
        linhas
        + [
            "",
            MARCA,
            "matchzy_whitelist_enabled_default true",
            "matchzy_kick_when_no_match_loaded true",
            'matchzy_demo_path "MatchZy/"',
            f'matchzy_demo_upload_url "{site}/api/servidor/gravacoes/{token}"',
            f'matchzy_remote_log_url "{site}/api/servidor/eventos"',
            'matchzy_remote_log_header_key "Authorization"',
            f'matchzy_remote_log_header_value "Bearer {token}"',
            "",
        ]
    )


def ler_ambiente(texto):
    valores = {}
    for linha in texto.splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            chave, valor = linha.split("=", 1)
            valores[chave.strip()] = valor.strip().strip('"')
    return valores


def principal(argumentos):
    if len(argumentos) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    config = pathlib.Path(argumentos[0])
    ambiente = ler_ambiente(pathlib.Path(argumentos[1]).read_text(encoding="utf-8"))
    faltando = [nome for nome in ("SITE_URL", "SERVIDOR_TOKEN") if not ambiente.get(nome)]
    if faltando:
        print(f"Faltando no arquivo: {', '.join(faltando)}", file=sys.stderr)
        return 1
    config.write_text(aplicar(config.read_text(encoding="utf-8"), ambiente["SITE_URL"], ambiente["SERVIDOR_TOKEN"]), encoding="utf-8")
    # O arquivo guarda o token, então só o dono lê.
    config.chmod(0o600)
    print("Configuração do MatchZy atualizada.")
    return 0


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
