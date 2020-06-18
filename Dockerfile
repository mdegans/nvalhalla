# FROM registry.hub.docker.com/mdegans/gstcudaplugin:latest
ARG GSTCUDAPLUGIN_TAG="latest"
ARG REPO_BASE="registry.hub.docker.com/"
FROM ${REPO_BASE}mdegans/gstcudaplugin:${GSTCUDAPLUGIN_TAG}

ARG SRCDIR="/usr/src/nvalhalla"

# set up source dir and copy source
WORKDIR ${SRCDIR}
COPY meson.build COPYING VERSION ./
COPY docs ./docs/
COPY includes ./includes/
COPY models ./models/
COPY nvinfer_configs ./nvinfer_configs/
COPY scripts ./scripts/
COPY test ./test/
COPY src ./src/

# install build dependencies, build, install, and uninstall build deps
# (all in one layer so as not to increase size)
# yes a multi-stage build could also be used, this is the "old" way
# among other things in this layer, we break interactive login capability.
# if a development image is needed or your internet is slow, this layer
# should probably be split up and the above copies moved into the middle
# (after deps install, just before the build)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgee-0.8-2 \
    libgee-0.8-dev \
    libglib2.0-dev \
    libgstreamer1.0-dev \
    libgstrtspserver-1.0-dev \
    ninja-build \
    python3-pip \
    python3-setuptools \
    valac \
    && pip3 install meson \
    && useradd -md /var/nvalhalla -rUs /bin/false nvalhalla \
    && mkdir build \
    && cd build \
    && meson --prefix=/usr .. \
    && ninja \
    && ninja test \
    && ninja install \
    && ninja clean \
    && rm -rf ${SRCDIR} \
    && cd / \
    && pip3 uninstall -y meson \
    && apt-get purge -y --autoremove \
    libgee-0.8-dev \
    ninja-build \
    python3-pip \
    python3-setuptools \
    valac \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /

# drop caps and run nvalhalla using the rtsp sink
USER nvalhalla:nvalhalla
ENV G_MESSAGES_DEBUG="all"
EXPOSE 8554/tcp
ENTRYPOINT ["nvalhalla", "--sink", "rtsp"]
