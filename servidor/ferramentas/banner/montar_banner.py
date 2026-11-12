"""Monta o pacote dos banners: uma placa fina, 3 por 1, que o plugin põe na frente dos painéis dos mapas.

Uso: python montar_banner.py <nome>=<imagem> [<nome>=<imagem> ...]
Cada imagem vira um modelo models/magnatas/banner_v1/<nome>.vmdl. A placa mede 192 x 64 unidades, de frente para +X,
com o centro na origem; o plugin aumenta ou diminui para caber na moldura. A imagem é encaixada em 3 por 1, sobre um
fundo escuro, sem cortar.

Depois compilar cada .vmat e .vmdl com: resourcecompiler -game csgo -addon magnatas_banner_v1 -i <arquivo>
Cada versão nova do pacote vira item novo na Oficina e pasta nova (banner_v2...), como os mutantes (ver ../mutante/LEIAME.md).
"""
import os
import subprocess
import sys

ADDON = os.environ.get('BANNER_ADDON', 'magnatas_banner_v1')
PASTA = os.environ.get('BANNER_PASTA', 'models/magnatas/banner_v1')
RAIZ = os.path.join(r'G:\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons', ADDON)
DESTINO = os.path.join(RAIZ, *PASTA.split('/'))

LARGURA, ALTURA = 192.0, 64.0
# A imagem é montada em 3 por 1 e esticada para 2048 x 1024: a placa desfaz o esticão, e a textura fica em potência de 2.
FUNDO = '0x120a1f'


def placa_obj() -> str:
    """Um quadrado de frente para +X. Visto de +X, a direita é +Y; os cantos vão no sentido anti-horário."""
    meia_l, meia_a = LARGURA / 2, ALTURA / 2
    return '\n'.join([
        '# Placa dos banners dos Magnatas (192 x 64, de frente para +X)',
        'mtllib placa.mtl',
        f'v 0 {-meia_l} {-meia_a}',
        f'v 0 {meia_l} {-meia_a}',
        f'v 0 {meia_l} {meia_a}',
        f'v 0 {-meia_l} {meia_a}',
        'vt 0 0',
        'vt 1 0',
        'vt 1 1',
        'vt 0 1',
        'vn 1 0 0',
        'usemtl placa',
        'f 1/1/1 2/2/1 3/3/1 4/4/1',
        '',
    ])


def vmat(nome: str, sombreado: str) -> str:
    textura = f'{PASTA}/materials/{nome}.png'
    if sombreado == 'luz':
        # Sem sombra do mapa: a placa fica sempre bem visível, como um painel iluminado.
        return f'''// Banner {nome}, sem luz do mapa.
Layer0
{{
	shader "csgo_unlitgeneric.vfx"
	g_vColorTint "[1.000000 1.000000 1.000000 0.000000]"
	TextureColor "{textura}"
}}
'''
    return f'''// Banner {nome}, com a luz do mapa.
Layer0
{{
	shader "csgo_complex.vfx"
	F_DO_NOT_CAST_SHADOWS 1
	TextureColor "{textura}"
	TextureRoughness "[0.800000 0.800000 0.800000 0.000000]"
	TextureMetalness "[0.000000 0.000000 0.000000 0.000000]"
}}
'''


def vmdl(nome_do_material: str) -> str:
    return f'''<!-- kv3 encoding:text:version{{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d}} format:modeldoc28:version{{fb63b6ca-f435-4aa0-a2c7-c66ddc651dca}} -->
{{
	rootNode =
	{{
		_class = "RootNode"
		children =
		[
			{{
				_class = "MaterialGroupList"
				children =
				[
					{{
						_class = "DefaultMaterialGroup"
						remaps =
						[
							{{
								from = "placa.vmat"
								to = "{PASTA}/materials/{nome_do_material}.vmat"
							}},
						]
						use_global_default = false
						global_default_material = ""
					}},
				]
			}},
			{{
				_class = "RenderMeshList"
				children =
				[
					{{
						_class = "RenderMeshFile"
						name = "placa"
						filename = "{PASTA}/placa.obj"
						import_scale = 1.0
					}},
				]
			}},
		]
		model_archetype = ""
		primary_associated_entity = ""
		anim_graph_name = ""
	}}
}}
'''


def escrever(caminho: str, texto: str) -> None:
    with open(caminho, 'w', encoding='utf-8', newline='\n') as arquivo:
        arquivo.write(texto)


def main(pares: list[str]) -> None:
    os.makedirs(os.path.join(DESTINO, 'materials'), exist_ok=True)
    escrever(os.path.join(DESTINO, 'placa.obj'), placa_obj())
    escrever(os.path.join(DESTINO, 'placa.mtl'), 'newmtl placa\n')
    for par in pares:
        nome, imagem = par.split('=', 1)
        png = os.path.join(DESTINO, 'materials', f'{nome}.png')
        # Encaixa sem cortar em 1536 x 512 sobre o fundo (a transparência da imagem mostra o fundo) e estica para 2048 x 1024.
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c={FUNDO}:s=1536x512', '-i', imagem,
                        '-filter_complex', f'[1:v]scale=1536:512:force_original_aspect_ratio=decrease[l];'
                                           f'[0:v][l]overlay=(W-w)/2:(H-h)/2,scale=2048:1024,format=rgb24',
                        '-frames:v', '1', png], check=True)
        for sombreado, sufixo in (('luz', '_luz'), ('mapa', '')):
            escrever(os.path.join(DESTINO, 'materials', f'{nome}{sufixo}.vmat'), vmat(nome, sombreado))
            escrever(os.path.join(DESTINO, f'{nome}{sufixo}.vmdl'), vmdl(f'{nome}{sufixo}'))
    print('pronto', sorted(os.listdir(DESTINO)), sorted(os.listdir(os.path.join(DESTINO, 'materials'))))


if __name__ == '__main__':
    main(sys.argv[1:])
