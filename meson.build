# todo(mdegans) read the version from the version file
project('nvalhalla', ['c', 'vala'],        version: '0.1.3',
  meson_version: '>= 0.40.0',
)

if target_machine.cpu_family() == 'aarch64'
  add_project_arguments(
    [
      '--define=TEGRA',
    ],
    language: 'vala'
  )
endif

subdir('src')
subdir('docs')

install_subdir('models', install_dir: 'share/nvalhalla')
install_subdir('nvinfer_configs', install_dir: 'share/nvalhalla')
install_subdir('scripts', install_dir: 'share/nvalhalla')
