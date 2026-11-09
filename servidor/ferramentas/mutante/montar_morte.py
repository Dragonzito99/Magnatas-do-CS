"""Monta o modelo de cena da morte do mutante no pacote magnatas_sons: o guerreiro tocando a queda, sem física.

Roda depois do exportar_morte.py, que grava guerreiro_morte.fbx (corpo e animação) direto na pasta do pacote.
O DMX do Blender Source Tools estragava a animação do esqueleto do Mixamo; o compilador lê o FBX certo.
Usa o material do mutante (models/magnatas/mutante/materials/mutante_corpo.vmat).
"""
import os

SAIDA = r'G:\Magnatas-ferramentas\zumbi\saida_morte'
ADDON = r'G:\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons\magnatas_sons'
PASTA = 'models/magnatas/mutante/morte'
DESTINO = os.path.join(ADDON, *PASTA.split('/'))
os.makedirs(DESTINO, exist_ok=True)

assert os.path.exists(os.path.join(DESTINO, 'guerreiro_morte.fbx'))

VMDL = '''<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:modeldoc28:version{fb63b6ca-f435-4aa0-a2c7-c66ddc651dca} -->
{
	rootNode =
	{
		_class = "RootNode"
		children =
		[
			{
				_class = "MaterialGroupList"
				children = 
				[
					{
						_class = "DefaultMaterialGroup"
						remaps = 
						[
							{
								from = "mutante_corpo.vmat"
								to = "models/magnatas/mutante/materials/mutante_corpo.vmat"
							},
						]
						use_global_default = false
						global_default_material = ""
					},
				]
			},
			{
				_class = "RenderMeshList"
				children =
				[
					{
						_class = "RenderMeshFile"
						name = "corpo"
						filename = "PASTA/guerreiro_morte.fbx"
					},
				]
			},
			{
				_class = "AnimationList"
				children =
				[
					{
						_class = "AnimFile"
						name = "morte"
						source_filename = "PASTA/guerreiro_morte.fbx"
						fade_in_time = 0.0
						fade_out_time = 0.0
						looping = false
						delta = false
						worldSpace = false
						hidden = false
					},
				]
				default_root_bone_name = ""
			},
		]
		model_archetype = ""
		primary_associated_entity = ""
		anim_graph_name = ""
		base_model_name = ""
	}
}
'''.replace('PASTA', PASTA)
with open(os.path.join(DESTINO, 'guerreiro_morte.vmdl'), 'w', encoding='utf-8', newline='\n') as arquivo:
    arquivo.write(VMDL)
print('pronto', sorted(os.listdir(DESTINO)))
