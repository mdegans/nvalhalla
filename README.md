# NValhalla

Is a simple DeepStream test app to perform live redaction and social distancing an an arbitrary number of sources. NValhalla is written in [Genie, a Vala dialect](https://wiki.gnome.org/Projects/Genie).

Usage is `nvalhalla --uri rtsp://uri-goes-here/ --uri file://local/file/here.mp4 ...` where each --uri supplied is a valid uri accepted by [uridecodebin](https://gstreamer.freedesktop.org/documentation/playback/uridecodebin.html?gi-language=c). Full help, including --gst options are available with --help

Distancing mode can be enabled by adding `--kenneth` as a flag. Guaranteed to [blow the Covid away](https://www.youtube.com/watch?v=uY6INyOaLGs). Distancing mode uses an int8 quantized model packaged with DeepStream, so performance should be much better than the redaction mode.

## Requirements

- hardware: An NVIDIA device capable of running DeepStream (tested on Jetson Nano, Jetson Xavier, and x86-64 NVIDIA Docker).
- software: `sudo apt install libgstreamer1.0-dev libglib2.0-dev libgee-0.8-dev libgstrtspserver-1.0-dev deepstream-5.0 valac meson`

note: if running with Docker, the software listed above does not need to be installed. Also, if installing on x86-64, deepstream-5.0 must be [download and installed manually](https://developer.nvidia.com/deepstream-sdk) as it is not in Nvidia's apt repositories.

## Installation

(see below for Docker instructions)

```shell
git clone https://github.com/mdegans/nvalhalla.git
cd nvalhalla
mkdir build
cd build
meson ..
ninja
sudo ninja install
```

(this installs to `/usr/local` prefix, same as make)

`sudo ninja uninstall` can be used to uninstall if you keep the build directory around.

## Running in Docker

Example with youtube sources (youtube-dl needs to be installed on the host with `pip3 install youtube-dl` or similar):
```
docker run --gpus all -p 8554:8554 --rm mdegans/nvalhalla --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=awdX61DPWf4) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=FPs_lU01KoI) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=SnMBYMOTwEs) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=jYusNNldesc)
```

(then access rtsp://hostname:8554/nvalhalla from an rtsp client like VLC or gst-play-1.0)

Notes:
- So far this is only tested on x86-64 NVIDIA Docker. The Dockerfile or meson.build may need to be modified for Tegra Docker support.
- The Image is fat AF, but that's because the base image is as well. It should pull quick if you already have the base images.
- The entrypoint defaults to --rtsp sink. Using a graphical sink in Docker is not recommended.
- Interactive login is disabled, but there are probabaly ways around this if you're clever.
- The image runs as a limited user.
- .dot files and the rest are stored in /var/nvalhalla/.nvalhalla/...
- verbose logging is on by default

## Examples

You can redact **multiple youtube streams** like this, provided you have youtube-dl installed (`pip3 install youtube-dl`) and enough bandwith:
```
nvalhalla --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=awdX61DPWf4) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=FPs_lU01KoI) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=SnMBYMOTwEs) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=jYusNNldesc)
```
![four youtube streams at once](https://i.imgur.com/7eo0NR5.jpg)

**Local video streams** can also be used like this:
```
nvalhalla --uri file:///home/username/Videos/test.mp4
```

**RTSP streams** are also supported:
```
nvalhalla --uri rtsp://hostname:port/path
```

Basically, any uri supported by [uridecodebin](https://gstreamer.freedesktop.org/documentation/playback/uridecodebin.html?gi-language=c) will probably work. If you find a combination that doesn't, please [report it](https://github.com/mdegans/nvalhalla/issues).

## FAQ

- **Can this app do anything but redact** No, and any potentially dangerous code (eg. dumping bounding boxes) has been removed. It's hoped that you won't modify it to do anything harmful, since software for detecting faces has an immense potential for misuse.
- **Can this app redact anything other than faces?** Yes. You can modify the app to do what you want by changing the config and models ~/.nvalhalla, however it will only redact IDs 0 and 1 unless you modify [cb_buffer.c](./src/cb_buffer.c).
- **This app isn't very useful** No, no, it isn't. It's meant mostly as a demo to see whether it's possible to write DeepStream code in Genie.
- **Can I output to a file?** Support for this is planned after optimization to help remedy the above point.
- **The app is very slow on my Nano** The model is currently not optimized at all, int8 and fp16 support is the next thing on the TODO list. It should run fine on a Xavier, however.
- **Why Genie?** Becuase it looks like Python, I like Python, and it fits perfectly with gstreamer. The Gstreamer project actually [recommends Vala](https://gstreamer.freedesktop.org/documentation/frequently-asked-questions/general.html?gi-language=c#why-is-gstreamer-written-in-c-why-not-cobjectivec) for those who want syntactic sugar, and Genie is just an alternative syntax for Vala. It makes writing GObject C a pleasure by not having to actually write GObject C.
