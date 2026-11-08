# Boneco do mutante

Transforma um personagem gerado com esqueleto Mixamo (FBX "riggeado") no boneco de jogador do CS2. Usa o Blender portátil, o Blender Source Tools e o Source 2 Viewer, todos em `G:\Magnatas-ferramentas`.

1. `blender -b --python encaixar.py -- "<arquivo.fbx>"`: põe o personagem na pose e no esqueleto do boneco do SAS e troca os pesos para os ossos do CS2.
2. `blender -b --python fotografar.py`: tira fotos parado e dobrando os ossos, para conferir.
3. `blender -b --python exportar.py`: grava o DMX para o ModelDoc.
4. `python montar_pacote.py`: monta `models/magnatas/mutante` no pacote `magnatas_sons`, com o material e o vmdl feitos a partir do SAS.
5. Compilar com o `resourcecompiler.exe -game csgo -addon magnatas_sons -i <mutante.vmdl>` e reenviar o pacote na Oficina.

A pasta tem que ficar dentro de `models/`: a Oficina só leva para o pacote as pastas listadas no `gameinfo.gi`, e `characters/` não está entre elas.
