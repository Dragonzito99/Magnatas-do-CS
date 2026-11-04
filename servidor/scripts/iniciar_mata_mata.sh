#!/usr/bin/env bash
# Inicia o modo Cada um por si na sessão tmux "mata-mata", ao lado do servidor de partidas.
# Uso: sudo -u cs2 bash /home/cs2/bin/iniciar_mata_mata.sh
set -euo pipefail

CASA=/home/cs2
SERVIDOR=$CASA/server/game
MATA_MATA=$CASA/mata-mata/game
SEGREDOS=$CASA/cs2.env

if [ "$(id -un)" != "cs2" ]; then
  echo "Rode como o usuário cs2." >&2
  exit 1
fi

if [ "${1:-}" = "--executar" ]; then
  # shellcheck disable=SC1090
  source "$SEGREDOS"
  cd "$CASA/mata-mata"
  CONTA=()
  [ -n "${GSLT_MATA_MATA:-}" ] && CONTA=(+sv_setsteamaccount "$GSLT_MATA_MATA")
  [ -n "${RCON_PASSWORD:-}" ] && CONTA+=(-usercon -ip "${CS2_IP:-0.0.0.0}" +rcon_password "$RCON_PASSWORD")
  exec game/cs2.sh -dedicated -condebug -port 27016 -maxplayers 16 \
    +game_type 1 +game_mode 2 +map de_dust2 \
    "${CONTA[@]}" +sv_password "$SV_PASSWORD" \
    +tv_enable 0 +exec mata_mata.cfg
fi

if tmux has-session -t mata-mata 2>/dev/null; then
  echo "O modo já está rodando. Console: tmux attach -t mata-mata"
  exit 0
fi

if [ ! -f "$SEGREDOS" ] || [ "$(stat -c %a "$SEGREDOS")" != "600" ]; then
  echo "$SEGREDOS precisa existir, com permissão 600." >&2
  exit 1
fi

# Os plugins das partidas ficam em addons, e o MatchZy forçaria o aquecimento e expulsaria quem não está em uma partida.
# Por isso este modo roda em uma pasta própria: os mapas são os mesmos, e só o programa, a configuração e o gameinfo são separados.
mkdir -p "$MATA_MATA/csgo/cfg"
cp -au "$SERVIDOR/bin" "$MATA_MATA/"
cp -a "$SERVIDOR/cs2.sh" "$MATA_MATA/"
for item in "$SERVIDOR"/*; do
  nome=$(basename "$item")
  case "$nome" in bin | cs2.sh | csgo) continue ;; esac
  ln -sfn "$item" "$MATA_MATA/$nome"
done
for item in "$SERVIDOR"/csgo/*; do
  nome=$(basename "$item")
  case "$nome" in addons | cfg | gameinfo.gi | MatchZy* | backup_round* | *.log) continue ;; esac
  ln -sfn "$item" "$MATA_MATA/csgo/$nome"
done
cp -au "$SERVIDOR/csgo/cfg/." "$MATA_MATA/csgo/cfg/"
rm -rf "$MATA_MATA/csgo/cfg/MatchZy"
grep -v 'csgo/addons/metamod' "$SERVIDOR/csgo/gameinfo.gi" > "$MATA_MATA/csgo/gameinfo.gi"
cp "$CASA/bin/mata_mata.cfg" "$MATA_MATA/csgo/cfg/mata_mata.cfg"
# O jogo aplica as regras padrão do mata-mata ao carregar o mapa, e só este arquivo vem depois delas.
cp "$CASA/bin/mata_mata.cfg" "$MATA_MATA/csgo/cfg/gamemode_deathmatch_server.cfg"

tmux new-session -d -x 200 -y 50 -s mata-mata "bash $(printf %q "${BASH_SOURCE[0]}") --executar"
echo "Modo iniciado na porta 27016. Console: tmux attach -t mata-mata. Para sair sem desligar: Ctrl+B e depois D."
