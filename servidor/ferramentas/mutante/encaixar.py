"""Encaixa o zumbi do Meshy (esqueleto Mixamo) no esqueleto dos bonecos do CS2 e exporta em DMX para o ModelDoc."""
import bpy, sys, math, mathutils, os

ORIGEM_ZUMBI = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else r'G:\Downloads_do_C\Zombie Teste.fbx'
SAIDA = r'G:\Magnatas-ferramentas\zumbi\saida'
os.makedirs(SAIDA, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sys.path.append(r'G:\Magnatas-ferramentas\bst\BlenderSourceTools-master')
import io_scene_valvesource
io_scene_valvesource.register()

# 1. O boneco do CS2, só pelo esqueleto.
bpy.ops.import_scene.smd(filepath=r'G:\Magnatas-ferramentas\cs2ref\agents\models\ctm_sas\ctm_sas_thirdperson_body.dmx')
cs2 = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        bpy.data.objects.remove(o)

# 2. O zumbi.
antes = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=ORIGEM_ZUMBI)
novos = [o for o in bpy.data.objects if o not in antes]
mix = next(o for o in novos if o.type == 'ARMATURE')
zumbi = next(o for o in novos if o.type == 'MESH')

def cabeca(arm, nome):
    return arm.matrix_world @ arm.data.bones[nome].head_local

# Gira para olhar para +X como no CS2 e ajusta o tamanho pela altura do quadril.
bpy.context.view_layer.update()
altura_quadril = cabeca(mix, 'mixamorig:Hips').z
escala = cabeca(cs2, 'pelvis').z / altura_quadril
mix.matrix_world = mathutils.Matrix.Rotation(math.radians(90), 4, 'Z') @ mathutils.Matrix.Scale(escala, 4) @ mix.matrix_world
bpy.context.view_layer.update()
# Quadril em cima do quadril do CS2.
desloca = cabeca(cs2, 'pelvis') - cabeca(mix, 'mixamorig:Hips')
desloca.z = 0
mix.matrix_world = mathutils.Matrix.Translation(desloca) @ mix.matrix_world
bpy.context.view_layer.update()

# 3. Põe o zumbi na pose de descanso do CS2 (braços em A), osso a osso, do tronco para as pontas.
# Cada par: osso do Mixamo, osso do CS2 de onde sai a direção, osso do CS2 para onde a direção aponta.
DIRECOES = [
    ('Spine', 'spine_0', 'spine_2'), ('Spine1', 'spine_2', 'spine_3'), ('Spine2', 'spine_3', 'neck_0'),
    ('Neck', 'neck_0', 'head_0'),
]
for lado, l in (('Left', 'L'), ('Right', 'R')):
    DIRECOES += [
        (f'{lado}Shoulder', f'clavicle_{l}', f'arm_upper_{l}'),
        (f'{lado}Arm', f'arm_upper_{l}', f'arm_lower_{l}'),
        (f'{lado}ForeArm', f'arm_lower_{l}', f'hand_{l}'),
        (f'{lado}Hand', f'hand_{l}', f'finger_middle_0_{l}'),
        (f'{lado}UpLeg', f'leg_upper_{l}', f'leg_lower_{l}'),
        (f'{lado}Leg', f'leg_lower_{l}', f'ankle_{l}'),
        (f'{lado}Foot', f'ankle_{l}', f'ball_{l}'),
    ]
    for dedo, d in (('Thumb', 'thumb'), ('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Pinky', 'pinky')):
        n0, n1, n2 = (f'finger_{d}_0_{l}', f'finger_{d}_1_{l}', f'finger_{d}_2_{l}')
        DIRECOES += [(f'{lado}Hand{dedo}1', n0, n1), (f'{lado}Hand{dedo}2', n1, n2)]

bpy.context.view_layer.objects.active = mix
bpy.ops.object.mode_set(mode='POSE')
for nome_mix, de, para in DIRECOES:
    pb = mix.pose.bones.get('mixamorig:' + nome_mix)
    if pb is None or de not in cs2.data.bones or para not in cs2.data.bones:
        print('PULEI', nome_mix, de, para)
        continue
    bpy.context.view_layer.update()
    alvo = (cabeca(cs2, para) - cabeca(cs2, de)).normalized()
    mundo = mix.matrix_world @ pb.matrix
    atual = (mix.matrix_world @ pb.tail - mix.matrix_world @ pb.head).normalized()
    giro = atual.rotation_difference(alvo).to_matrix().to_4x4()
    cabeca_mundo = mundo.to_translation()
    novo = mathutils.Matrix.Translation(cabeca_mundo) @ giro @ mathutils.Matrix.Translation(-cabeca_mundo) @ mundo
    pb.matrix = mix.matrix_world.inverted() @ novo
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')

# Aplica a pose no corpo do zumbi: a malha fica parada na pose do CS2.
bpy.context.view_layer.objects.active = zumbi
for mod in zumbi.modifiers:
    if mod.type == 'ARMATURE':
        bpy.ops.object.modifier_apply(modifier=mod.name)
zumbi_mundo = zumbi.matrix_world.copy()
zumbi.parent = None
zumbi.matrix_world = zumbi_mundo
bpy.ops.object.select_all(action='DESELECT')
zumbi.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 4. Troca os nomes dos grupos de peso do Mixamo pelos ossos do CS2.
MAPA = {'Hips': 'pelvis', 'Spine': 'spine_1', 'Spine1': 'spine_2', 'Spine2': 'spine_3', 'Neck': 'neck_0', 'Head': 'head_0',
        'HeadTop_End': 'head_0', 'Bone_016': 'head_0', 'headfront': 'head_0'}
for lado, l in (('Left', 'L'), ('Right', 'R')):
    MAPA.update({f'{lado}Shoulder': f'clavicle_{l}', f'{lado}Arm': f'arm_upper_{l}', f'{lado}ForeArm': f'arm_lower_{l}',
                 f'{lado}Hand': f'hand_{l}', f'{lado}UpLeg': f'leg_upper_{l}', f'{lado}Leg': f'leg_lower_{l}',
                 f'{lado}Foot': f'ankle_{l}', f'{lado}ToeBase': f'ball_{l}', f'{lado}Toe_End': f'ball_{l}'})
    for dedo, d in (('Thumb', 'thumb'), ('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Pinky', 'pinky')):
        for i, n in ((1, 0), (2, 1), (3, 2), (4, 2)):
            MAPA[f'{lado}Hand{dedo}{i}'] = f'finger_{d}_{n}_{l}'

# Junta grupos que caem no mesmo osso do CS2.
pesos = {}
for v in zumbi.data.vertices:
    for g in v.groups:
        nome = zumbi.vertex_groups[g.group].name.replace('mixamorig:', '')
        destino = MAPA.get(nome)
        if destino is None:
            print('SEM DESTINO', nome)
            continue
        pesos.setdefault(destino, {})
        pesos[destino][v.index] = pesos[destino].get(v.index, 0) + g.weight
zumbi.vertex_groups.clear()
for destino, por_vertice in pesos.items():
    grupo = zumbi.vertex_groups.new(name=destino)
    for indice, peso in por_vertice.items():
        grupo.add([indice], peso, 'REPLACE')

# 5. O corpo do zumbi passa a seguir o esqueleto do CS2.
bpy.data.objects.remove(mix)
zumbi.name = 'mutante_corpo'
zumbi.parent = cs2
mod = zumbi.modifiers.new('Armature', 'ARMATURE')
mod.object = cs2

# Texturas embutidas no FBX vão para arquivos.
for img in bpy.data.images:
    if img.packed_file or img.source == 'FILE':
        nome = bpy.path.clean_name(img.name.rsplit('.', 1)[0]) + '.png'
        img.filepath_raw = os.path.join(SAIDA, nome)
        img.file_format = 'PNG'
        try:
            img.save()
            print('TEXTURA', nome, img.size[:])
        except Exception as erro:
            print('TEXTURA FALHOU', img.name, erro)

mn = [min((zumbi.matrix_world @ v.co)[i] for v in zumbi.data.vertices) for i in range(3)]
mx = [max((zumbi.matrix_world @ v.co)[i] for v in zumbi.data.vertices) for i in range(3)]
print('ESCALA', round(escala, 3), 'CAIXA', [round(x, 1) for x in mn], [round(x, 1) for x in mx])
print('GRUPOS', sorted(pesos))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SAIDA, 'mutante.blend'))
