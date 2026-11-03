"""Confere se a máquina serve para rodar o servidor de CS2 da etapa 1."""
import os
import platform
import shutil
import sys
from dataclasses import asdict, dataclass

NUCLEOS_MINIMOS = 2
RAM_MINIMA_GIB = 6.0
DISCO_MINIMO_GIB = 70.0


@dataclass
class Fatos:
    sistema: str
    arquitetura: str
    avx: bool
    nucleos: int
    ram_gib: float
    disco_livre_gib: float
    root: bool


def avaliar(fatos: Fatos) -> list[str]:
    problemas = []
    if fatos.sistema != "Linux":
        problemas.append(f"O sistema é {fatos.sistema}, e o plano usa Linux.")
    if fatos.arquitetura != "x86_64":
        problemas.append(f"A arquitetura é {fatos.arquitetura}, e o CS2 precisa de x86_64.")
    if not fatos.avx:
        problemas.append("O processador não tem AVX, que o CS2FOW exige.")
    if fatos.nucleos < NUCLEOS_MINIMOS:
        problemas.append(f"Tem {fatos.nucleos} núcleos, e o mínimo é {NUCLEOS_MINIMOS}.")
    if fatos.ram_gib < RAM_MINIMA_GIB:
        problemas.append(f"Tem {fatos.ram_gib:.1f} GiB de RAM, e o mínimo é {RAM_MINIMA_GIB:.0f}.")
    if fatos.disco_livre_gib < DISCO_MINIMO_GIB:
        problemas.append(f"Tem {fatos.disco_livre_gib:.1f} GiB livres em disco, e o mínimo é {DISCO_MINIMO_GIB:.0f}.")
    if not fatos.root:
        problemas.append("Sem acesso root, não dá para instalar o servidor.")
    return problemas


def ler_avx(cpuinfo: str) -> bool:
    for linha in cpuinfo.splitlines():
        if linha.startswith("flags"):
            return "avx" in linha.split(":", 1)[1].split()
    return False


def ler_ram_gib(meminfo: str) -> float:
    for linha in meminfo.splitlines():
        if linha.startswith("MemTotal:"):
            return int(linha.split()[1]) / (1024 * 1024)
    return 0.0


def _ler_arquivo(caminho: str) -> str:
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return arquivo.read()
    except OSError:
        return ""


def coletar(caminho_disco: str = "/") -> Fatos:
    return Fatos(
        sistema=platform.system(),
        arquitetura=platform.machine(),
        avx=ler_avx(_ler_arquivo("/proc/cpuinfo")),
        nucleos=os.cpu_count() or 0,
        ram_gib=ler_ram_gib(_ler_arquivo("/proc/meminfo")),
        disco_livre_gib=shutil.disk_usage(caminho_disco).free / 1024**3,
        root=hasattr(os, "geteuid") and os.geteuid() == 0,
    )


def main() -> int:
    fatos = coletar()
    for campo, valor in asdict(fatos).items():
        print(f"{campo}: {valor:.1f}" if isinstance(valor, float) else f"{campo}: {valor}")
    problemas = avaliar(fatos)
    for problema in problemas:
        print(f"- {problema}")
    print("REPROVADO" if problemas else "APROVADO")
    return 1 if problemas else 0


if __name__ == "__main__":
    sys.exit(main())
