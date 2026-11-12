#!/usr/bin/env bash

pgrep -f '^Xvfb :99' >/dev/null || (setsid nohup Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &)
for _ in $(seq 50); do
	[ -S /tmp/.X11-unix/X99 ] && break
	sleep 0.1
done

pgrep -x x11vnc >/dev/null || x11vnc -display :99 -forever -shared -nopw -localhost -rfbport 5900 -xkb -quiet -bg -o /tmp/x11vnc.log >/dev/null
pgrep -f '^python3 -m websockify' >/dev/null \
	|| (setsid nohup /opt/novnc/utils/websockify/run --web /opt/novnc "${HOST:-127.0.0.1}:6080" localhost:5900 >/tmp/novnc.log 2>&1 &)
