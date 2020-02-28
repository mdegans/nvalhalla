project('nvalhalla', ['c', 'vala'],        version: '0.1.0',
  meson_version: '>= 0.40.0',
)

# comment this out to disable debug code (relatively pointless):
add_project_arguments('--define=DEBUG', language: 'vala')

subdir('src')

install_subdir('models', install_dir: 'share/nvalhalla')
install_subdir('nvinfer_configs', install_dir: 'share/nvalhalla')
