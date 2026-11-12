FROM mcr.microsoft.com/devcontainers/base:ubuntu26.04

ARG BUN_VERSION=1.4.4

# Without pipefail a failed download of Bun's installer pipes nothing into bash and the build passes.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		libxcb1 libxkbcommon0 libxkbcommon-x11-0 mesa-vulkan-drivers \
		xvfb xauth x11-apps fontconfig fonts-dejavu-core unzip \
	&& rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}"

COPY install-chrome.sh /tmp/install-chrome.sh
RUN bash /tmp/install-chrome.sh && rm /tmp/install-chrome.sh
