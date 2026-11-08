import bpy, math, mathutils, sys, os

SAIDA = r'G:\Magnatas-ferramentas\zumbi\saida'
bpy.ops.wm.open_mainfile(filepath=os.path.join(SAIDA, 'mutante.blend'))
cena = bpy.context.scene
cena.render.engine = 'BLENDER_WORKBENCH'
cena.display.shading.light = 'STUDIO'
cena.display.shading.color_type = 'TEXTURE'
cena.render.resolution_x = 700
cena.render.resolution_y = 900
cena.world = bpy.data.worlds.new('fundo') if not cena.world else cena.world

cam_dados = bpy.data.cameras.new('cam')
cam_dados.type = 'ORTHO'
cam_dados.ortho_scale = 90
cam = bpy.data.objects.new('cam', cam_dados)
cena.collection.objects.link(cam)
cena.camera = cam
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')

def foto(nome, posicao, alvo=(0, 0, 38)):
    cam.location = posicao
    direcao = mathutils.Vector(alvo) - mathutils.Vector(posicao)
    cam.rotation_euler = direcao.to_track_quat('-Z', 'Y').to_euler()
    cena.render.filepath = os.path.join(SAIDA, nome)
    bpy.ops.render.render(write_still=True)

foto('frente.png', (200, 0, 38))
foto('lado.png', (0, 200, 38))

# Dobra joelhos, cotovelos e gira a cabeça, para ver se a malha acompanha os ossos do CS2.
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for nome, eixo, graus in [('leg_upper_L', 'Z', -40), ('leg_lower_L', 'Z', 60), ('arm_lower_R', 'Z', 70), ('arm_upper_L', 'Y', 40), ('head_0', 'X', 30), ('spine_2', 'Z', 15)]:
    pb = arm.pose.bones[nome]
    pb.rotation_mode = 'XYZ'
    setattr(pb.rotation_euler, eixo.lower(), math.radians(graus))
bpy.ops.object.mode_set(mode='OBJECT')
foto('pose_frente.png', (200, 0, 38))
foto('pose_lado.png', (0, 200, 38))
