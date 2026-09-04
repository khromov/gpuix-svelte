#!/usr/bin/env bash
#
# GPUI's guess_compositor() falls back to a headless platform — a window with no
# surface and no GPU — when neither WAYLAND_DISPLAY nor DISPLAY is set, and reports
# no error while doing it. So the session has to be up and the variable exported
# before the app starts, or the demo "runs" and paints nothing.
set -euo pipefail

MODE="${GPUIX_LINUX_DISPLAY:-wayland}"
# sway tiles and draws a title-only bar; labwc floats and draws a titlebar with
# move/minimise/maximise/close, which is the closer thing to a normal desktop.
WM="${GPUIX_LINUX_WM:-sway}"
SIZE="${GPUIX_LINUX_SIZE:-1280x800}"
ENV_FILE=/tmp/gpuix-session.env

export XDG_RUNTIME_DIR=/tmp/xdg
mkdir -p "$XDG_RUNTIME_DIR" /out
chmod 700 "$XDG_RUNTIME_DIR"

log() { echo "[session] $*" >&2; }

wait_for() {
	local what=$1 i
	shift
	for ((i = 0; i < 200; i++)); do
		"$@" >/dev/null 2>&1 && return 0
		sleep 0.05
	done
	log "$what never came up"
	return 1
}

case "$MODE" in
wayland)
	# Wayland wins over X11 in guess_compositor whenever this is non-empty, so the
	# two modes must never both be set.
	unset DISPLAY
	export WLR_BACKENDS=headless
	export WLR_LIBINPUT_NO_DEVICES=1
	export WLR_NO_HARDWARE_CURSORS=1
	# The compositor rasterises in software; the GPUI client still gets Vulkan via
	# lavapipe, so this keeps sway itself off the GPU path without touching the app.
	export WLR_RENDERER=pixman

	if [ "$WM" = labwc ]; then
		log "starting labwc ($SIZE)"
		labwc &
	else
		cat >/tmp/sway.conf <<-EOF
			output HEADLESS-1 resolution $SIZE
			default_border ${GPUIX_LINUX_BORDER:-none}
			gaps inner 0
			gaps outer 0
		EOF

		log "starting sway ($SIZE)"
		sway -c /tmp/sway.conf &
	fi
	sway_pid=$!

	# wlroots takes the first free wayland-N, so which one it is depends on lockfile
	# state — discover it rather than assuming wayland-1.
	sock=""
	for ((i = 0; i < 200; i++)); do
		kill -0 "$sway_pid" 2>/dev/null || {
			log "sway exited during startup"
			exit 1
		}
		sock=$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -name 'wayland-[0-9]*' ! -name '*.lock' -printf '%f\n' 2>/dev/null | sort | head -1)
		[ -n "$sock" ] && break
		sleep 0.05
	done
	[ -n "$sock" ] || {
		log "no wayland socket appeared"
		exit 1
	}
	export WAYLAND_DISPLAY="$sock"
	export SWAYSOCK="$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -name 'sway-ipc.*.sock' | head -1)"

	# labwc has no config-file output mode, so the size is set over
	# wlr-output-management once it is up.
	if [ "$WM" = labwc ]; then
		wlr-randr --output HEADLESS-1 --custom-mode "$SIZE" 2>/dev/null || log "wlr-randr could not set $SIZE"
	fi

	log "starting wayvnc"
	# Without --render-cursor a headless output has no pointer in the stream, which
	# means clicking blind in the browser.
	wayvnc --render-cursor 0.0.0.0 5900 &
	;;
x11)
	unset WAYLAND_DISPLAY
	log "starting Xvfb ($SIZE)"
	# -noreset, or Xvfb resets when the last client exits and takes x11vnc with it.
	Xvfb :99 -screen 0 "${SIZE}x24" -nolisten tcp -noreset &
	wait_for "the X11 socket" test -e /tmp/.X11-unix/X99
	export DISPLAY=:99

	log "starting x11vnc"
	x11vnc -display :99 -forever -shared -nopw -quiet -rfbport 5900 &
	;;
gnome)
	# The repro for "no window chrome on Ubuntu". Mutter implements no
	# wlr-screencopy, so it cannot feed wayvnc directly; it nests inside Xvfb
	# instead and x11vnc exports that. The app is Mutter's *Wayland* client, so
	# GPUI's X11 backend is never involved.
	unset WAYLAND_DISPLAY
	log "starting Xvfb ($SIZE) as Mutter's host"
	Xvfb :99 -screen 0 "${SIZE}x24" -nolisten tcp -noreset &
	wait_for "the X11 socket" test -e /tmp/.X11-unix/X99
	export DISPLAY=:99

	log "starting x11vnc"
	x11vnc -display :99 -forever -shared -nopw -quiet -rfbport 5900 &

	log "starting nested mutter"
	dbus-run-session -- mutter --nested --wayland --wayland-display=wayland-mutter &
	wait_for "mutter's wayland socket" test -S "$XDG_RUNTIME_DIR/wayland-mutter"

	# guess_compositor prefers Wayland only while DISPLAY is unset, and mutter
	# --nested refuses to start when DISPLAY is set but empty — so it is dropped
	# entirely rather than blanked.
	unset DISPLAY
	export WAYLAND_DISPLAY=wayland-mutter
	;;
*)
	log "GPUIX_LINUX_DISPLAY must be 'wayland', 'x11' or 'gnome', got '$MODE'"
	exit 1
	;;
esac

# `docker exec` gets the service's environment, not what this script discovered, so
# anything joining the session later (linux:shot) has to read it back from here.
{
	echo "export XDG_RUNTIME_DIR='$XDG_RUNTIME_DIR'"
	# Only what is actually set: an exported but empty DISPLAY is not the same as
	# an unset one — mutter --nested rejects the first and accepts the second.
	[ -n "${WAYLAND_DISPLAY:-}" ] && echo "export WAYLAND_DISPLAY='$WAYLAND_DISPLAY'"
	[ -n "${SWAYSOCK:-}" ] && echo "export SWAYSOCK='$SWAYSOCK'"
	[ -n "${DISPLAY:-}" ] && echo "export DISPLAY='$DISPLAY'"
	# grim speaks wlr-screencopy, which only the wlroots compositors have; under
	# gnome the picture comes from the Xvfb that Mutter is nested in.
	if [ "$MODE" = wayland ]; then
		echo 'gpuix_shot() { grim "$1"; }'
	else
		echo 'gpuix_shot() { import -display :99 -window root "$1"; }'
	fi
} >"$ENV_FILE"

log "starting novnc on 6080"
websockify --web=/usr/share/novnc 6080 localhost:5900 &

[ -n "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ] || {
	log "no display — the app would run headless and paint nothing"
	exit 1
}

log "ready — http://localhost:6080/vnc.html"

"$@" &
app=$!

trap 'kill -TERM "$app" 2>/dev/null || true' INT TERM

# Whichever of the app, the compositor or the VNC bridge dies first ends the
# container, rather than leaving the app painting into nothing.
wait -n
status=$?
kill -TERM "$app" 2>/dev/null || true
exit "$status"
