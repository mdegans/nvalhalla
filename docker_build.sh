#!/bin/bash

set -ex

# change this if you fork the repo and want to push you own image
readonly AUTHOR="mdegans"
readonly PROJ_NAME="nvalhalla"

# this is so much more arcane than python, but people frown on build scripts written in python
# https://stackoverflow.com/questions/59895/how-to-get-the-source-directory-of-a-bash-script-from-within-the-script-itself
readonly THIS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
TAG_SUFFIX=$(git rev-parse --abbrev-ref HEAD)
if [[ $TAG_SUFFIX == "master" ]]; then
    TAG_SUFFIX="latest"
    REPO_BASE="registry.hub.docker.com/"
else
    # naked pull in dev
    REPO_BASE=""
fi
readonly VERSION=$(head -n 1 $THIS_DIR/VERSION)
readonly TAG_BASE="$AUTHOR/$PROJ_NAME"
TAG_FULL="$TAG_BASE:$VERSION"

if [[ "$(arch)" == "aarch64" ]]; then
    readonly DOCKERFILE="$THIS_DIR/tegra.Dockerfile"
    readonly GSTCUDAPLUGIN_TAG="0.3.4-aarch64"
    readonly TAG_SUFFIX="${TAG_SUFFIX}-tegra"
    readonly TAG_FULL="${TAG_FULL}-tegra"
else
    readonly DOCKERFILE="$THIS_DIR/x86.Dockerfile"
    readonly GSTCUDAPLUGIN_TAG="0.3.4-x86_64"
    readonly TAG_SUFFIX="${TAG_SUFFIX}-x86"
    readonly TAG_FULL="${TAG_FULL}-x86"
fi

echo "Building $TAG_FULL from $DOCKERFILE"

docker build --pull --rm -f $DOCKERFILE \
    --build-arg REPO_BASE=$REPO_BASE \
    --build-arg GSTCUDAPLUGIN_TAG=$GSTCUDAPLUGIN_TAG \
    -t $TAG_FULL \
    $THIS_DIR
docker tag "$TAG_FULL" "$TAG_BASE:$TAG_SUFFIX"
