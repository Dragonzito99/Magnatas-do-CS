"""Pergunta a um servidor de CS2 se ele informa o VAC como ativo.

Uso: python checar_vac.py <host> [porta]
"""
import sys

import a2s


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print(__doc__.strip())
        return 2
    host = sys.argv[1]
    porta = int(sys.argv[2]) if len(sys.argv) == 3 else 27015
    try:
        info = a2s.info((host, porta))
    except (OSError, a2s.BrokenMessageError):
        print(f"sem resposta de {host}:{porta}")
        return 1
    print(f"vac_enabled={int(info.vac_enabled)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
