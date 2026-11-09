# Boneco do mutante

Transforma um personagem gerado com esqueleto Mixamo (FBX "riggeado") no boneco de jogador do CS2. Usa o Blender portátil, o Blender Source Tools e o Source 2 Viewer, todos em `G:\Magnatas-ferramentas`.

1. `blender -b --python encaixar.py -- "<arquivo.fbx>"`: põe o personagem na pose e no esqueleto do boneco do SAS e troca os pesos para os ossos do CS2.
2. `blender -b --python fotografar.py`: tira fotos parado e dobrando os ossos, para conferir.
3. `blender -b --python exportar.py`: grava o DMX para o ModelDoc.
4. `python montar_pacote.py`: monta `models/magnatas/mutante` no pacote `magnatas_sons`, com o material e o vmdl feitos a partir do SAS.
5. Compilar com o `resourcecompiler.exe -game csgo -addon magnatas_sons -i <mutante.vmdl>` e reenviar o pacote na Oficina.

A pasta tem que ficar dentro de `models/`: a Oficina só leva para o pacote as pastas listadas no `gameinfo.gi`, e `characters/` não está entre elas.

## Cada versão do boneco num pacote próprio

A Steam entrega uma atualização do pacote ao servidor e ao jogo de cada um em horas diferentes. Com o mesmo caminho e conteúdo diferente, o boneco tinha um esqueleto no servidor e outro no jogo, e o jogo de quem virava mutante fechava ("OnPreserveEntity", 08/11). Por isso:

- o boneco e a queda ficam num pacote só deles (`magnatas_mutante`), separado dos sons (`magnatas_sons`);
- cada versão usa uma pasta nova (`models/magnatas/mutante_v1`, `_v2`...) e é publicada como item **novo** na Oficina (botão New, nunca Re-Upload);
- o plugin aponta para o item e a pasta da versão, e o servidor manda baixar o item (`mm_extra_addons`).

Os scripts leem `MUTANTE_ADDON` e `MUTANTE_PASTA`. Exemplo da v1:

```
export MUTANTE_ADDON=magnatas_mutante MUTANTE_PASTA=models/magnatas/mutante_v1
blender -b --python exportar.py
python montar_pacote.py
blender -b --python exportar_morte.py -- "<fbx animado>"
python montar_morte.py
```

Depois compilar `materials/mutante_corpo.vmat`, `mutante.vmdl` e `morte/guerreiro_morte.vmdl` com `-addon magnatas_mutante`.
