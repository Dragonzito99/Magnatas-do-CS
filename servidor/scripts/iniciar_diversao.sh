#!/usr/bin/env bash
# Inicia os servidores da aba Diversão, cada um na própria sessão tmux, ao lado do servidor de partidas.
# Uso: sudo -u cs2 bash /home/cs2/bin/iniciar_diversao.sh <ak-desert|pistola|awp|equipe|todos>
set -euo pipefail

CASA=/home/cs2
SERVIDOR=$CASA/server/game
CONFIGS=$CASA/bin/diversao
SEGREDOS=$CASA/cs2.env
PLUGIN=$CASA/bin/MagnatasDiversao.dll
NOME=${1:-}

if [ "$(id -un)" != "cs2" ]; then
  echo "Rode como o usuário cs2." >&2
  exit 1
fi

if [ "$NOME" = "todos" ]; then
  for arquivo in "$CONFIGS"/*.conf; do
    nome=$(basename "$arquivo" .conf)
    # Os laboratórios só ligam pela aba Testes do site, quando o Adm pede.
    case "$nome" in laboratorio-*) continue ;; esac
    bash "${BASH_SOURCE[0]}" "$nome"
  done
  exit 0
fi

if [ -z "$NOME" ] || [ ! -f "$CONFIGS/$NOME.conf" ]; then
  echo "Servidor desconhecido. Use um destes, ou todos:" >&2
  ls "$CONFIGS" | sed -n 's/\.conf$//p' >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIGS/$NOME.conf"
PASTA=$CASA/diversao/$NOME/game
PASTA_DOS_PLUGINS=$PASTA/csgo/addons/counterstrikesharp/plugins

if [ "${2:-}" = "--executar" ]; then
  # shellcheck disable=SC1090
  source "$SEGREDOS"
  cd "$CASA/diversao/$NOME"
  # O -condebug recomeça o registro a cada vez que o servidor liga: o da vez anterior fica guardado, para uma queda
  # logo antes de um reinício ainda poder ser conferida (11/11/2026).
  REGISTRO=game/csgo/addons/metamod/console.log
  [ -f "$REGISTRO" ] && mv -f "$REGISTRO" "$REGISTRO.anterior"
  # O .conf pode apontar outro token: os dois laboratórios usam o mesmo, GSLT_LABORATORIO.
  VARIAVEL_DO_TOKEN=GSLT_$(echo "${NOME_DO_TOKEN:-$NOME}" | tr 'a-z-' 'A-Z_')
  CONTA=()
  [ -n "${!VARIAVEL_DO_TOKEN:-}" ] && CONTA=(+sv_setsteamaccount "${!VARIAVEL_DO_TOKEN}")
  [ -n "${RCON_PASSWORD:-}" ] && CONTA+=(-usercon -ip "${CS2_IP:-0.0.0.0}" +rcon_password "$RCON_PASSWORD")
  # Só com host_workshop_map o servidor liga e fica parado: ele precisa abrir um mapa do jogo antes.
  MAPA_DA_OFICINA=()
  [ -n "${OFICINA:-}" ] && MAPA_DA_OFICINA=(+host_workshop_map "$OFICINA")
  exec game/cs2.sh -dedicated -condebug -port "$PORTA" -maxplayers "$VAGAS" \
    +game_type "$GAME_TYPE" +game_mode "$GAME_MODE" +map "$MAPA" "${MAPA_DA_OFICINA[@]}" \
    "${CONTA[@]}" +sv_password "$SV_PASSWORD" \
    +tv_enable 0 +exec magnatas_diversao.cfg
fi

if tmux has-session -t "diversao-$NOME" 2>/dev/null; then
  echo "$NOME já está rodando. Console: tmux attach -t diversao-$NOME"
  exit 0
fi

if [ ! -f "$SEGREDOS" ] || [ "$(stat -c %a "$SEGREDOS")" != "600" ]; then
  echo "$SEGREDOS precisa existir, com permissão 600." >&2
  exit 1
fi

# Sem o plugin o servidor sobe, mas a arma principal não vem e o site não enxerga ninguém.
if [ ! -f "$PLUGIN" ]; then
  echo "Falta o plugin em $PLUGIN. Rode: sudo bash compilar_plugin.sh" >&2
  exit 1
fi

# O MatchZy forçaria o aquecimento e expulsaria quem não está em uma partida.
# Por isso cada servidor roda em uma pasta própria: os mapas são os mesmos, e o programa, a configuração e os plugins são separados.
mkdir -p "$PASTA/csgo/cfg"
# Ligações em vez de cópia: não ocupa espaço duplicado, e refazer pega a versão nova depois de uma atualização do CS2.
rm -rf "$PASTA/bin"
cp -al "$SERVIDOR/bin" "$PASTA/"
# Os mapas da Oficina ficam fora da pasta do programa, para não baixar de novo a cada início nem uma vez por servidor.
OFICINA_COMPARTILHADA=$CASA/diversao/oficina
mkdir -p "$OFICINA_COMPARTILHADA"
rm -rf "$PASTA/bin/linuxsteamrt64/steamapps"
ln -sfn "$OFICINA_COMPARTILHADA" "$PASTA/bin/linuxsteamrt64/steamapps"
cp -a "$SERVIDOR/cs2.sh" "$PASTA/"
for item in "$SERVIDOR"/*; do
  nome=$(basename "$item")
  case "$nome" in bin | cs2.sh | csgo) continue ;; esac
  ln -sfn "$item" "$PASTA/$nome"
done
for item in "$SERVIDOR"/csgo/*; do
  nome=$(basename "$item")
  case "$nome" in addons | cfg | gameinfo.gi | MatchZy* | backup_round* | *.log) continue ;; esac
  ln -sfn "$item" "$PASTA/csgo/$nome"
done
cp -au "$SERVIDOR/csgo/cfg/." "$PASTA/csgo/cfg/"
rm -rf "$PASTA/csgo/cfg/MatchZy"
cp -au "$SERVIDOR/csgo/addons" "$PASTA/csgo/"
rm -rf "$PASTA_DOS_PLUGINS/MatchZy"
mkdir -p "$PASTA_DOS_PLUGINS/MagnatasDiversao"
cp "$PLUGIN" "$PASTA_DOS_PLUGINS/MagnatasDiversao/MagnatasDiversao.dll"
CONFIG_DO_PLUGIN=$PASTA/csgo/addons/counterstrikesharp/configs/plugins/MagnatasDiversao
mkdir -p "$CONFIG_DO_PLUGIN"
# O plugin usa o endereço e o token para informar o resultado ao site, então o arquivo só pode ser lido pelo usuário cs2.
# shellcheck disable=SC1090
source "$SEGREDOS"
: "${SITE_URL:=}" "${SERVIDOR_TOKEN:=}"
touch "$CONFIG_DO_PLUGIN/MagnatasDiversao.json"
chmod 600 "$CONFIG_DO_PLUGIN/MagnatasDiversao.json"
# Laboratório: o plugin abre os comandos de teste do Adm, nunca manda resultado ao site e desliga sozinho quando vazio.
EH_LABORATORIO=false
[ "${LABORATORIO:-}" = "1" ] && EH_LABORATORIO=true
printf '{ "ArmaPrincipal": "%s", "Regra": "%s", "Porta": %s, "SiteUrl": "%s", "Token": "%s", "Rotacao": "%s", "Laboratorio": %s, "ConfigVersion": 1 }\n' \
  "$ARMA_PRINCIPAL" "$REGRA" "$PORTA" "$SITE_URL" "$SERVIDOR_TOKEN" "${ROTACAO:-}" "$EH_LABORATORIO" > "$CONFIG_DO_PLUGIN/MagnatasDiversao.json"
cp "$SERVIDOR/csgo/gameinfo.gi" "$PASTA/csgo/gameinfo.gi"
cat "$CONFIGS/$BASE" "$CONFIGS/$NOME.cfg" > "$PASTA/csgo/cfg/magnatas_diversao.cfg"
# O jogo aplica as regras padrão do modo ao carregar o mapa, e só este arquivo vem depois delas.
cp "$PASTA/csgo/cfg/magnatas_diversao.cfg" "$PASTA/csgo/cfg/$REGRAS_DO_JOGO"

tmux new-session -d -x 200 -y 50 -s "diversao-$NOME" "bash $(printf %q "${BASH_SOURCE[0]}") $(printf %q "$NOME") --executar"
echo "$NOME iniciado na porta $PORTA. Console: tmux attach -t diversao-$NOME. Para sair sem desligar: Ctrl+B e depois D."
