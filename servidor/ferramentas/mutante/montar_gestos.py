"""Monta o modelo de cena dos gestos (gestos/gestos.vmdl): o corpo do primeiro gesto e uma animação por gesto.

Uso: python montar_gestos.py danca:sem_repetir flexao:repetir mortal:sem_repetir  (na ordem do exportar_gestos.py)
Usa o material do personagem (<MUTANTE_PASTA>/materials/mutante_corpo.vmat), montado pelo montar_pacote.py.
"""
import os, sys

ADDON = os.path.join(r'G:\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons', os.environ.get('MUTANTE_ADDON', 'magnatas_personagens'))
PASTA_DO_CORPO = os.environ.get('MUTANTE_PASTA', 'models/magnatas/adm_v1')
PASTA = PASTA_DO_CORPO + '/gestos'
DESTINO = os.path.join(ADDON, *PASTA.split('/'))
GESTOS = [par.split(':') for par in sys.argv[1:]]
for gesto, _ in GESTOS:
    assert os.path.exists(os.path.join(DESTINO, f'{gesto}.fbx')), gesto

animacoes = ''.join(f'''
					{{
						_class = "AnimFile"
						name = "{gesto}"
						source_filename = "{PASTA}/{gesto}.fbx"
						fade_in_time = 0.2
						fade_out_time = 0.2
						looping = {'true' if repetir == 'repetir' else 'false'}
						delta = false
						worldSpace = false
						hidden = false
					}},''' for gesto, repetir in GESTOS)

VMDL = f'''<!-- kv3 encoding:text:version{{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d}} format:modeldoc28:version{{fb63b6ca-f435-4aa0-a2c7-c66ddc651dca}} -->
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
								from = "mutante_corpo.vmat"
								to = "{PASTA_DO_CORPO}/materials/mutante_corpo.vmat"
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
						name = "corpo"
						filename = "{PASTA}/{GESTOS[0][0]}.fbx"
					}},
				]
			}},
			{{
				_class = "AnimationList"
				children =
				[{animacoes}
				]
				default_root_bone_name = ""
			}},
		]
		model_archetype = ""
		primary_associated_entity = ""
		anim_graph_name = ""
		base_model_name = ""
	}}
}}
'''
with open(os.path.join(DESTINO, 'gestos.vmdl'), 'w', encoding='utf-8', newline='\n') as arquivo:
    arquivo.write(VMDL)
print('pronto', sorted(os.listdir(DESTINO)))
