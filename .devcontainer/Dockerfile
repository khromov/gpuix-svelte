FROM mcr.microsoft.com/devcontainers/base:ubuntu26.04

ARG BUN_VERSION=1.4.4
ARG NOVNC_VERSION=1.6.0
ARG WEBSOCKIFY_VERSION=0.13.0

# Without pipefail a failed download of Bun's installer pipes nothing into bash and the build passes.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		libxcb1 libxkbcommon0 libxkbcommon-x11-0 mesa-vulkan-drivers \
		xvfb xauth x11-apps fontconfig fonts-dejavu-core unzip \
		x11vnc python3 xdotool netpbm \
	&& rm -rf /var/lib/apt/lists/*

# Ubuntu's novnc package depends on its own nodejs and its websockify on numpy, so both come from upstream's tags.
RUN mkdir -p /opt/novnc/utils/websockify \
	&& curl -fsSL "https://github.com/novnc/noVNC/archive/refs/tags/v${NOVNC_VERSION}.tar.gz" \
		| tar -xz -C /opt/novnc --strip-components=1 \
	&& curl -fsSL "https://github.com/novnc/websockify/archive/refs/tags/v${WEBSOCKIFY_VERSION}.tar.gz" \
		| tar -xz -C /opt/novnc/utils/websockify --strip-components=1 \
	&& rm -rf /opt/novnc/tests /opt/novnc/docs /opt/novnc/snap /opt/novnc/utils/websockify/tests
COPY novnc-index.html /opt/novnc/index.html

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}"

COPY install-chrome.sh /tmp/install-chrome.sh
RUN bash /tmp/install-chrome.sh && rm /tmp/install-chrome.sh
