#!/usr/bin/env bash
# Instala a SteamCMD e o CS2 para o usuário cs2. Pode rodar de novo sem quebrar nada.
# Uso: sudo bash instalar_cs2.sh
set -euo pipefail

USUARIO=cs2
CASA=/home/$USUARIO
SERVIDOR=$CASA/server
STEAMCMD=$CASA/steamcmd
ORIGEM="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo." >&2
  exit 1
fi

if command -v apt-get >/dev/null; then
  PACOTES=(tmux curl tar ca-certificates lib32gcc-s1 python3 cron)
  ldconfig -p | grep -q libicuuc || PACOTES+=(libicu-dev)
  FALTANDO=()
  for pacote in "${PACOTES[@]}"; do
    dpkg -s "$pacote" >/dev/null 2>&1 || FALTANDO+=("$pacote")
  done
  if [ "${#FALTANDO[@]}" -gt 0 ]; then
    dpkg --add-architecture i386
    apt-get update -qq
    # A máquina pode rodar outros sistemas, então a instalação não reinicia serviços.
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y -qq "${FALTANDO[@]}"
  fi
elif command -v dnf >/dev/null; then
  dnf install -y -q tmux curl tar ca-certificates glibc.i686 libstdc++.i686 libicu python3 cronie
else
  echo "Distribuição não reconhecida. Instale tmux, curl, libicu e as bibliotecas de 32 bits da SteamCMD." >&2
  exit 1
fi

id "$USUARIO" >/dev/null 2>&1 || useradd -m -s /bin/bash "$USUARIO"

como_cs2() {
  runuser -u "$USUARIO" -- "$@"
}

como_cs2 mkdir -p "$STEAMCMD" "$SERVIDOR" "$CASA/bin" "$CASA/.steam/sdk64"
if [ ! -x "$STEAMCMD/steamcmd.sh" ]; then
  curl -fsSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz \
    | como_cs2 tar -xz -C "$STEAMCMD"
fi

como_cs2 "$STEAMCMD/steamcmd.sh" +force_install_dir "$SERVIDOR" +login anonymous +app_update 730 validate +quit

como_cs2 ln -sf "$STEAMCMD/linux64/steamclient.so" "$CASA/.steam/sdk64/steamclient.so"

install -o "$USUARIO" -g "$USUARIO" -m 755 "$ORIGEM/scripts/iniciar_cs2.sh" "$ORIGEM/scripts/atualizar_cs2.sh" "$ORIGEM/scripts/conferir_cs2.sh" "$ORIGEM/scripts/atualizar_lista.sh" "$ORIGEM/scripts/iniciar_diversao.sh" "$ORIGEM/scripts/ligar_diversao.sh" "$ORIGEM/scripts/desligar_diversao.sh" "$CASA/bin/"
install -o "$USUARIO" -g "$USUARIO" -m 644 "$ORIGEM/ferramentas/gameinfo.py" "$CASA/bin/"
# Roda como root e mexe nos segredos: fica fora da pasta do cs2, que o usuário dos servidores pode alterar.
install -o root -g root -m 700 "$ORIGEM/scripts/guardar_token_steam.sh" /usr/local/sbin/
runuser -u "$USUARIO" -- mkdir -p "$CASA/bin/diversao"
install -o "$USUARIO" -g "$USUARIO" -m 644 "$ORIGEM"/config/diversao/* "$CASA/bin/diversao/"
# Ilha Lemnos: o arquivo de cada mapa (postos, saídas, caixas e chão), copiado para a pasta do plugin na primeira vez.
runuser -u "$USUARIO" -- mkdir -p "$CASA/bin/lemnos"
install -o "$USUARIO" -g "$USUARIO" -m 644 "$ORIGEM"/config/lemnos/* "$CASA/bin/lemnos/"
install -o "$USUARIO" -g "$USUARIO" -m 644 "$ORIGEM/config/server.cfg" "$SERVIDOR/game/csgo/cfg/server.cfg"

# O site (usuário magnatas) liga e desliga os servidores da Diversão só por estes dois scripts.
# Um sudoers com erro trava o sudo da máquina inteira, então a regra só entra depois de conferida.
REGRA=$(mktemp)
cp "$ORIGEM/config/sudoers-magnatas-diversao" "$REGRA"
if visudo -cf "$REGRA" >/dev/null; then
  install -o root -g root -m 440 "$REGRA" /etc/sudoers.d/magnatas-diversao
else
  echo "A regra do sudoers da Diversão tem erro; não foi instalada." >&2
fi
rm -f "$REGRA"

# O plugin dos servidores da Diversão só compila com o CounterStrikeSharp instalado.
if [ -f "$SERVIDOR/game/csgo/addons/counterstrikesharp/api/CounterStrikeSharp.API.dll" ]; then
  bash "$ORIGEM/scripts/compilar_plugin.sh"
else
  echo "Depois de instalar o CounterStrikeSharp, rode: sudo bash $ORIGEM/scripts/compilar_plugin.sh"
fi

# O MatchZy só deixa entrar quem está nesta lista: sem o agendamento, membro novo fica de fora.
cat > /etc/cron.d/magnatas-lista <<AGENDA
* * * * * $USUARIO bash $CASA/bin/atualizar_lista.sh >/dev/null 2>>$CASA/atualizar_lista.log
AGENDA
chmod 644 /etc/cron.d/magnatas-lista

# Se a máquina reiniciar (queda na hospedagem, 13/11/2026), o servidor de jogo volta sozinho; o site já voltava.
cat > /etc/cron.d/magnatas-ligar <<AGENDA
@reboot $USUARIO sleep 60 && bash $CASA/bin/iniciar_cs2.sh >>$CASA/iniciar_ao_ligar.log 2>&1
AGENDA
chmod 644 /etc/cron.d/magnatas-ligar

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 27015/udp
  # Os dois laboratórios do Adm (aba Testes do site).
  ufw allow 27022:27023/udp
  # Ilha Lemnos, sempre ligada.
  ufw allow 27024/udp
fi

echo "CS2 instalado em $SERVIDOR."
if ! { command -v ufw >/dev/null && ufw status | grep -q "Status: active"; } \
  && ! { command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; }; then
  echo "ATENÇÃO: nenhum firewall ativo nesta máquina. Em um servidor na internet, deixe aberta só a porta 27015/udp." >&2
fi
echo "Se houver firewall no painel do provedor, libere só a porta 27015/udp."
