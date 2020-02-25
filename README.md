# NValhalla

Is a simple DeepStream test app written in [Genie, a Vala dialect](https://wiki.gnome.org/Projects/Genie), that compiles down to GObject based C. It looks like Python, yet is as fast as pure C, because it is pure C without the hair pulling, crashes, and memory leaks.

Usage is `nvalhalla --uri rtsp://uri-goes-here/ --uri file://local/file/here.mp4 ...` where each --uri supplied is a valid uri accepted by [uridecodebin](https://gstreamer.freedesktop.org/documentation/playback/uridecodebin.html?gi-language=c). With no options, NValhalla will attempt to use nvarguscamerasrc. Full help, including --gst options are available with --help

## Requirements

- hardware: A Tegra device (tested on Jetson Nano and Jetson Xavier). X86/NVIDIA with DeepStream installed *may* work, however this configuration has not been tested.
- software: `sudo apt install libgstreamer1.0-dev libglib2.0-dev libgee-0.8-dev deepstream-4.0 valac meson`

## Installation

```shell
git clone https://github.com/mdegans/nvalhalla.git
cd nvalhalla
mkdir build
cd build
meson ..
ninja
```
When the build is complete, the nvalhalla executable can be found in `build/src/` nvalhalla can be run in it's build location with ./nvalhalla or copied to any user or global bin folder (eg. `~/bin`, `~/.local/bin`, or `/usr/local/bin`)

## Examples

You watch **multiple youtube streams** like this, provided you have youtube-dl installed (`pip3 install youtube-dl`) and enough bandwith:

```
nvalhalla --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=awdX61DPWf4) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=FPs_lU01KoI) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=SnMBYMOTwEs) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=jYusNNldesc)
```
![four youtube streams at once](https://i.imgur.com/23EQWQO.jpg)
