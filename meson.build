project('nvalhalla', ['c', 'vala'],        version: '0.1.0',
  meson_version: '>= 0.40.0',
)

# todo: figure out how to autodetect tegra
add_project_arguments(
  [
    '--define=DEBUG',
    '--define=TEGRA',
  ],
  language: 'vala'
)

subdir('src')

install_subdir('models', install_dir: 'share/nvalhalla')
install_subdir('nvinfer_configs', install_dir: 'share/nvalhalla')
