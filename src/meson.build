nvalhalla_sources = [
  'main.gs',
  'nvalhalla.gs',
]

cc = meson.get_compiler('c')

nvalhalla_deps = [
  dependency('glib-2.0', version: '>= 2.50'),
  dependency('gstreamer-1.0', version: '>= 1.0'),
  dependency('gee-0.8'),
  # this is needed for the SignalHandler:
  meson.get_compiler('vala').find_library('posix'),
  cc.find_library('m', required : false),
]

executable('nvalhalla', nvalhalla_sources,
  vala_args: '--target-glib=2.50', dependencies: nvalhalla_deps,
  install: true,
)
