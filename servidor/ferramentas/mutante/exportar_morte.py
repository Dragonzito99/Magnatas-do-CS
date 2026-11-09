"""Grava o guerreiro com a animação de morte do Meshy (esqueleto Mixamo) em FBX, na pasta do pacote, para o modelo de cena.

Uso: blender -b --python exportar_morte.py -- "<arquivo animado.fbx>"
Depois: python montar_morte.py e compilar models/magnatas/mutante/morte/guerreiro_morte.vmdl.

O DMX do Blender Source Tools estragava a animação desse esqueleto (o corpo esticava); o compilador do CS2 lê o FBX
direto e acerta. O modelo de cena tem esqueleto próprio: não é o boneco do jogador, só toca a queda no lugar do corpo.
"""
import bpy, sys, os, mathutils

ORIGEM = sys.argv[sys.argv.index('--') + 1]
DESTINO = r'G:\Steam\steamapps\common\Counter-Strike Global Offensive\content\csgo_addons\magnatas_sons\models\magnatas\mutante\morte\guerreiro_morte.fbx'
# Mesma altura do boneco do mutante no jogo (75 polegadas).
ALTURA = 75.0
# Medido: com escala 1, cada metro do Blender vira 366,5 unidades no jogo depois de compilado.
UNIDADES_POR_METRO = 366.5

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=ORIGEM)
malha = next(o for o in bpy.data.objects if o.type == 'MESH')
acao = bpy.data.actions[0]
acao.name = 'morte'
# O compilador troca este nome pelo material do mutante (o remap fica no vmdl).
malha.data.materials[0].name = 'mutante_corpo'

# Altura em pé, no primeiro quadro.
bpy.context.scene.frame_set(int(acao.frame_range[0]))
dg = bpy.context.evaluated_depsgraph_get()
pontos = [malha.matrix_world @ v.co for v in malha.evaluated_get(dg).to_mesh().vertices]
altura = max(p.z for p in pontos) - min(p.z for p in pontos)
escala = ALTURA / (altura * UNIDADES_POR_METRO)

os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
bpy.ops.export_scene.fbx(filepath=DESTINO, global_scale=escala, bake_anim=True, bake_anim_use_all_actions=False,
                         bake_anim_use_nla_strips=False, add_leaf_bones=False, embed_textures=False, path_mode='STRIP')
print('ALTURA_BLENDER', round(altura, 3), 'ESCALA', round(escala, 4), 'FBX', os.path.getsize(DESTINO))
