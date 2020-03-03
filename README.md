# NValhalla

Is a simple DeepStream test app to perform live redaction an an arbitrary number of sources. NValhalla is written in [Genie, a Vala dialect](https://wiki.gnome.org/Projects/Genie), that compiles down to GObject based C. It looks like Python, yet is as fast as pure C, because it is pure C without the hair pulling, crashes, and memory leaks.

Usage is `nvalhalla --uri rtsp://uri-goes-here/ --uri file://local/file/here.mp4 ...` where each --uri supplied is a valid uri accepted by [uridecodebin](https://gstreamer.freedesktop.org/documentation/playback/uridecodebin.html?gi-language=c). With no options, NValhalla will attempt to use nvarguscamerasrc. Full help, including --gst options are available with --help

## Requirements

- hardware: A Tegra device (tested on Jetson Nano and Jetson Xavier). X86/NVIDIA with DeepStream installed *may* work, however this configuration has not been tested.
- software: `sudo apt install libgstreamer1.0-dev libglib2.0-dev libgee-0.8-dev libgstrtspserver-1.0-dev deepstream-4.0 valac meson`

## Installation

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

`sudo ninja uninstall` can be used to uninstall

## Examples

You can redact **multiple youtube streams** like this, provided you have youtube-dl installed (`pip3 install youtube-dl`) and enough bandwith:
```
nvalhalla --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=awdX61DPWf4) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=FPs_lU01KoI) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=SnMBYMOTwEs) --uri $(youtube-dl -f best -g https://www.youtube.com/watch?v=jYusNNldesc)
```
![four youtube streams at once](https://i.imgur.com/23EQWQO.jpg)

**Local video streams** can also be used like this:
```
nvalhalla --uri file:///home/username/Videos/test.mp4
```

**RTSP streams** are also supported:
```
nvalhalla --uri rtsp://hostname:port/path
```

Basically, and uri supported by [uridecodebin](https://gstreamer.freedesktop.org/documentation/playback/uridecodebin.html?gi-language=c) will probably work. If you find a combination that doesn't, please [report it](https://github.com/mdegans/nvalhalla/issues).

## FAQ

- **Why the Satan & Winnie the Pooh stuff in the license**? I don't actually believe in Satan or have anything against Dear Leader, Xi Dada, however it's my desire that portions of this sofware not be used to make the next iteration of a [Uighur detector](https://www.nytimes.com/2019/05/22/world/asia/china-surveillance-xinjiang.html). If anybody is offended and has a legitimate reason for wanting it removed, please [file an issue](https://github.com/mdegans/nvalhalla/issues) and plead your case publicly. I may consider a relicense *to an individual party* for a good reason. Emails on this topic will be ignored.

- **Why NValhalla**? It's partially a joke on how Nvidia likes to prefix everything and anything with NV, and it was the first word that came to my mind containing "Vala". Also it's certainly heaven writing Vala/Genie Gstreamer (compared to C, or even Python), so the whole thing fits.
