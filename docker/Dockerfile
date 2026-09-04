# Ubuntu rather than a node:* image because 24.04's mesa-vulkan-drivers carries the
# lavapipe ICD, which is the only Vulkan device a container without a GPU can offer,
# and amd64 because @gpuix/native publishes no linux-arm64 prebuild.
FROM --platform=linux/amd64 ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Split by role so a missing library says which layer is wrong. Fonts are load-bearing:
# fontconfig with no installed family paints no glyphs at all.
RUN apt-get update && apt-get install -y --no-install-recommends \
	libvulkan1 mesa-vulkan-drivers libgl1-mesa-dri libegl1 vulkan-tools \
	libwayland-client0 libxkbcommon0 libxkbcommon-x11-0 \
	libxcb1 libx11-xcb1 libxcb-randr0 libxcb-xfixes0 libxcb-shape0 libxcb-xinput0 \
	libfontconfig1 libfreetype6 libssl3 \
	fonts-dejavu-core fonts-noto-color-emoji \
	&& rm -rf /var/lib/apt/lists/*

# sway tiles (good for viewing several demos); labwc floats with real titlebar
# buttons, which is what GPUIX_LINUX_WM=labwc gives you.
RUN apt-get update && apt-get install -y --no-install-recommends \
	sway labwc wlr-randr wayvnc grim xwayland wayland-utils \
	xvfb x11vnc x11-utils imagemagick \
	mutter dbus-x11 \
	novnc websockify \
	&& rm -rf /var/lib/apt/lists/*

# libatomic1 is what the official Node linux-x64 build links against; without it
# every `node` invocation dies at the loader.
RUN apt-get update && apt-get install -y --no-install-recommends \
	curl ca-certificates xz-utils unzip git procps libatomic1 \
	&& rm -rf /var/lib/apt/lists/*

# The official tarball rather than NodeSource, so the version is pinned here and the
# image does not depend on a third-party apt repo staying up. Matches .nvmrc's major.
ARG NODE_VERSION=26.8.1
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
	| tar -xJ -C /usr/local --strip-components=1 --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md

# `npm run compile` and every bun: twin need it; the installer drops it in /root/.bun.
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# The dependency layer on its own, so editing source does not reinstall. vendor/ holds
# the `file:` svelte tarball, so `npm ci` fails without it.
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund

# Turns the apt list above from a guess into an assertion: a missing runtime library
# names itself here rather than at `new GpuixRenderer()`.
RUN set -eux; \
	so=$(ls node_modules/@gpuix/native-linux-x64-gnu/*.node); \
	ldd "$so"; \
	! ldd "$so" | grep -q 'not found'; \
	node -e "const n=require('@gpuix/native'); if (typeof n.GpuixRenderer!=='function') process.exit(1); console.log('binding ok, hasTestGpuixRenderer:', n.hasTestGpuixRenderer())"

COPY . .

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 5900 6080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash"]
