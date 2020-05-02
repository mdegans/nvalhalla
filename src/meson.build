cc = meson.get_compiler('c')

nvalhalla_sources = files(
  'redactor.gs',
  'rtspserversink.gs',
  'cb_buffer.c',
  'nvalhalla.gs',
  'setup.gs',
  'utils.gs',
  'validate.gs',
)

includes = include_directories('../includes')

# a .pc would be nice in the next release of DeepStream, if you're reading, Nvidia.
ds_includes = include_directories('/opt/nvidia/deepstream/deepstream-4.0/sources/includes')
ds_libdir = '/opt/nvidia/deepstream/deepstream-4.0/lib'

nvalhalla_deps = [
  dependency('gee-0.8'),
  dependency('gio-2.0', version: '>=2.0'),
  dependency('glib-2.0', version: '>=2.50'),
  dependency('gobject-2.0', version: '>=2.0'),
  dependency('gstreamer-1.0', version: '>=1.0'),
  dependency('gstreamer-rtsp-server-1.0', version: '>=1.0'),
  # this is needed for the SignalHandler:
  meson.get_compiler('vala').find_library('posix'),
  # this is needed for Math
  cc.find_library('m', required : false),
  cc.find_library('nvds_meta', dirs: ds_libdir),
  cc.find_library('nvdsgst_meta', dirs: ds_libdir),
]

executable('nvalhalla', 'main.gs', nvalhalla_sources,
  vala_args: [
    '--header=nvalhalla.h',
    '--vapi=nvalhalla.vapi',
  ],
  dependencies: nvalhalla_deps,
  install: true,
  include_directories: [includes, ds_includes],
)
