from dataclasses import replace

import pytest

from verificar_servidor import Fatos, avaliar, coletar, ler_avx, ler_ram_gib

BOM = Fatos("Linux", "x86_64", True, 4, 8.0, 100.0, True)


def test_servidor_bom_nao_tem_problemas():
    assert avaliar(BOM) == []


@pytest.mark.parametrize(
    "campo,valor,trecho",
    [
        ("sistema", "Windows", "Linux"),
        ("arquitetura", "aarch64", "x86_64"),
        ("avx", False, "AVX"),
        ("nucleos", 1, "núcleos"),
        ("ram_gib", 5.9, "RAM"),
        ("disco_livre_gib", 99.0, "disco"),
        ("root", False, "root"),
    ],
)
def test_cada_requisito_reprova(campo, valor, trecho):
    problemas = avaliar(replace(BOM, **{campo: valor}))
    assert len(problemas) == 1 and trecho in problemas[0]


def test_valores_no_limite_sao_aceitos():
    assert avaliar(replace(BOM, nucleos=2, ram_gib=6.0, disco_livre_gib=100.0)) == []


def test_avx_vem_da_linha_de_flags():
    cpuinfo = "model name\t: Xeon\nflags\t\t: fpu sse2 avx avx2\n"
    assert ler_avx(cpuinfo) is True


def test_sem_avx_nas_flags_e_falso():
    cpuinfo = "model name\t: AVX Marketing Name\nflags\t\t: fpu sse2\n"
    assert ler_avx(cpuinfo) is False


def test_ram_vem_de_memtotal_em_gib():
    meminfo = "MemTotal:        8388608 kB\nMemFree:         1048576 kB\n"
    assert ler_ram_gib(meminfo) == 8.0


def test_coletar_nao_quebra_fora_do_linux():
    fatos = coletar(".")
    assert fatos.nucleos >= 1 and fatos.disco_livre_gib > 0
