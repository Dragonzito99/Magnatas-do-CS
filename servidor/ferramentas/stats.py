"""Transforma o CSV de uma partida do MatchZy na tabela usada pela ficha do jogador.

Uso: python stats.py <entrada.csv> <saida.csv>
"""
import csv
import os
import re
import sys

COLUNAS_NECESSARIAS = ("steamid64", "team", "name", "kills", "deaths", "assists", "damage", "head_shot_kills")
COLUNAS_NUMERICAS = ("kills", "deaths", "assists", "damage", "head_shot_kills")
COLUNAS_SAIDA = ("steamid64", "apelido", "time", "abates", "mortes", "assistencias", "kd", "hs_pct", "dano")
INTEIRO = re.compile(r"-?[0-9]+")


def calcular_kd(kills: int, deaths: int) -> float:
    return round(kills / deaths, 2) if deaths else float(kills)


def hs_pct(head_shot_kills: int, kills: int) -> float:
    return round(100 * head_shot_kills / kills, 1) if kills else 0.0


def ler_partida(caminho: str) -> list[dict]:
    with open(caminho, encoding="utf-8", newline="") as arquivo:
        leitor = csv.DictReader(arquivo)
        if not leitor.fieldnames:
            raise ValueError(f"{caminho} está vazio.")
        faltando = [coluna for coluna in COLUNAS_NECESSARIAS if coluna not in leitor.fieldnames]
        if faltando:
            raise ValueError(f"{caminho} não tem as colunas: {', '.join(faltando)}.")
        linhas = []
        for linha in leitor:
            for coluna in COLUNAS_NUMERICAS:
                valor = linha.get(coluna)
                if valor is None or not INTEIRO.fullmatch(valor):
                    raise ValueError(f"{caminho}, linha {leitor.line_num}: a coluna {coluna} tem '{valor}', e devia ser um número inteiro.")
                linha[coluna] = int(valor)
            linhas.append(linha)
    if not linhas:
        raise ValueError(f"{caminho} está vazio, sem nenhum jogador.")
    return linhas


def exportar(entrada: str, saida: str) -> None:
    linhas = ler_partida(entrada)
    temporario = f"{saida}.tmp"
    with open(temporario, "w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, lineterminator="\n")
        escritor.writerow(COLUNAS_SAIDA)
        for linha in linhas:
            escritor.writerow(
                [
                    linha["steamid64"],
                    linha["name"],
                    linha["team"],
                    linha["kills"],
                    linha["deaths"],
                    linha["assists"],
                    calcular_kd(linha["kills"], linha["deaths"]),
                    hs_pct(linha["head_shot_kills"], linha["kills"]),
                    linha["damage"],
                ]
            )
    os.replace(temporario, saida)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip())
        return 2
    try:
        exportar(sys.argv[1], sys.argv[2])
    except (OSError, ValueError) as erro:
        print(f"Erro: {erro}", file=sys.stderr)
        return 1
    print(f"Tabela gravada em {sys.argv[2]}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
