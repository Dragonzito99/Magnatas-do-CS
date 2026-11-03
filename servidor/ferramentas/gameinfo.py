"""Coloca a linha do Metamod no gameinfo.gi, que as atualizações do CS2 sobrescrevem.

Uso: python3 gameinfo.py <caminho do gameinfo.gi>
"""
import sys

CAMINHO_METAMOD = "csgo/addons/metamod"


def aplicar_metamod(texto: str) -> str:
    if CAMINHO_METAMOD in texto:
        return texto
    linhas = texto.splitlines(keepends=True)
    for indice, linha in enumerate(linhas):
        if "Game_LowViolence" in linha and "csgo_lv" in linha:
            indentacao = linha[: len(linha) - len(linha.lstrip())]
            fim = "\r\n" if linha.endswith("\r\n") else "\n"
            linhas.insert(indice + 1, f"{indentacao}Game\t{CAMINHO_METAMOD}{fim}")
            return "".join(linhas)
    raise ValueError("Não encontrei a linha Game_LowViolence csgo_lv no gameinfo.gi.")


def aplicar_no_arquivo(caminho: str) -> bool:
    with open(caminho, encoding="utf-8", newline="") as arquivo:
        texto = arquivo.read()
    novo = aplicar_metamod(texto)
    if novo == texto:
        return False
    with open(caminho, "w", encoding="utf-8", newline="") as arquivo:
        arquivo.write(novo)
    return True


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 2
    try:
        mudou = aplicar_no_arquivo(sys.argv[1])
    except (OSError, ValueError) as erro:
        print(f"Erro: {erro}", file=sys.stderr)
        return 1
    print("Metamod aplicado." if mudou else "O Metamod já estava aplicado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
