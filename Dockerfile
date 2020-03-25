FROM nvcr.io/nvidia/deepstream:4.0.2-19.12-devel

# set up source dir and copy source
WORKDIR /opt/nvalhalla/source
COPY meson.build COPYING ./
COPY docs ./docs/
COPY includes ./includes/
COPY models ./models/
COPY nvinfer_configs ./nvinfer_configs/
COPY scripts ./scripts/
COPY src ./src

# install build dependencies, build, install, and uninstall build deps
# (all in one layer so as not to increase size)
# yes a multi-stage build could also be used, this is the "old" way
# amont other things, we break interactive login capability.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgee-0.8-dev \
    libglib2.0-dev \
    libgstreamer1.0-dev \
    libgstrtspserver-1.0-dev \
    meson \
    valac \
    libgee-0.8-2 \
    && cp -R /root/deepstream_sdk_v4.0.2_x86_64/sources/ /opt/nvidia/deepstream/deepstream-4.0/ \
    && useradd -md /var/nvalhalla -rUs /bin/false nvalhalla \
    && mkdir build \
    && cd build \
    && meson .. \
    && ninja \
    && ninja install \
    && apt-get purge -y --autoremove \
    libgee-0.8-dev \
    libglib2.0-dev \
    libgstreamer1.0-dev \
    libgstrtspserver-1.0-dev \
    meson \
    valac

# drop caps and run nvalhalla using the rtsp sink
USER nvalhalla:nvalhalla
ENV G_MESSAGES_DEBUG="all"
EXPOSE 8554/tcp
ENTRYPOINT ["nvalhalla", "--sink", "rtsp"]
