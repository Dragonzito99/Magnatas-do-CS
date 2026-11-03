"""Valida o arquivo de membros e gera a lista de liberados e a partida do MatchZy.

Uso:
  python membros.py whitelist membros.csv
  python membros.py partida membros.csv de_mirage
"""
import csv
import io
import json
import random
import re
import sys
from dataclasses import dataclass

COLUNAS = ("steamid64", "apelido", "papel")
PAPEIS = ("jogador", "gm", "adm")
STEAMID64 = re.compile(r"7656119\d{10}")
JOGADORES_POR_PARTIDA = 10


@dataclass
class Membro:
    steamid64: str
    apelido: str
    papel: str


def _decodificar(dados: bytes) -> str:
    try:
        return dados.decode("utf-8-sig")
    except UnicodeDecodeError:
        return dados.decode("cp1252")


def ler_membros(caminho: str) -> list[Membro]:
    with open(caminho, "rb") as arquivo:
        texto = _decodificar(arquivo.read())
    primeira_linha = texto.split("\n", 1)[0]
    separador = ";" if ";" in primeira_linha else ","
    leitor = csv.DictReader(io.StringIO(texto, newline=""), delimiter=separador)
    if not leitor.fieldnames or any(coluna not in leitor.fieldnames for coluna in COLUNAS):
        raise ValueError(f"O cabeçalho precisa ter as colunas {', '.join(COLUNAS)}.")

    membros: list[Membro] = []
    vistos: set[str] = set()
    for linha in leitor:
        numero = leitor.line_num
        steamid, apelido, papel = ((linha.get(coluna) or "").strip() for coluna in COLUNAS)
        if not STEAMID64.fullmatch(steamid):
            raise ValueError(f"linha {numero}: '{steamid}' não é um SteamID64 de 17 dígitos.")
        if steamid in vistos:
            raise ValueError(f"linha {numero}: {steamid} está duplicado.")
        if not apelido:
            raise ValueError(f"linha {numero}: apelido vazio.")
        if papel not in PAPEIS:
            raise ValueError(f"linha {numero}: papel '{papel}' desconhecido. Use {', '.join(PAPEIS)}.")
        vistos.add(steamid)
        membros.append(Membro(steamid, apelido, papel))
    return membros


def gerar_whitelist(membros: list[Membro]) -> str:
    return "".join(f"{membro.steamid64}\n" for membro in membros)


def _jogadores(membros: list[Membro]) -> dict[str, str]:
    return {membro.steamid64: membro.apelido for membro in membros}


def gerar_partida(membros: list[Membro], mapa: str, semente: int | None = None) -> dict:
    jogadores = [membro for membro in membros if membro.papel == "jogador"]
    if len(jogadores) != JOGADORES_POR_PARTIDA:
        raise ValueError(f"A partida precisa de {JOGADORES_POR_PARTIDA} jogadores, e há {len(jogadores)}.")
    equipe = [membro for membro in membros if membro.papel != "jogador"]

    random.Random(semente).shuffle(jogadores)
    meio = JOGADORES_POR_PARTIDA // 2
    partida = {
        "maplist": [mapa],
        "num_maps": 1,
        "players_per_team": meio,
        "skip_veto": True,
        "team1": {"name": "Time A", "players": _jogadores(jogadores[:meio])},
        "team2": {"name": "Time B", "players": _jogadores(jogadores[meio:])},
    }
    if equipe:
        partida["spectators"] = {"players": _jogadores(equipe)}
    return partida


def main(argumentos: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        if len(argumentos) == 2 and argumentos[0] == "whitelist":
            sys.stdout.write(gerar_whitelist(ler_membros(argumentos[1])))
        elif len(argumentos) == 3 and argumentos[0] == "partida":
            partida = gerar_partida(ler_membros(argumentos[1]), argumentos[2])
            print(json.dumps(partida, ensure_ascii=False, indent=2))
        else:
            print(__doc__.strip(), file=sys.stderr)
            return 2
    except (OSError, ValueError) as erro:
        print(f"Erro: {erro}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
