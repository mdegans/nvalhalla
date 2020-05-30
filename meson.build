# todo(mdegans) read the version from the version file
project('nvalhalla', ['c', 'vala'],
  version: run_command(
    'head', '-n', '1', files('VERSION'),
  ).stdout().strip(),
  meson_version: '>= 0.49.0',
)

if target_machine.cpu_family() == 'aarch64'
  message('TEGRA Detected')
  add_project_arguments(
    [
      '--define=TEGRA',
    ],
    language: 'vala'
  )
endif

if run_command('cat', '/proc/device-tree/nvidia,dtsfilename').stdout().contains('t19x')
  message('XAVIER/TX2 Detected')
  add_project_arguments(
    [
      '--define=TX2_XAV',
    ],
    language: 'vala'
  )
endif

subdir('src')
subdir('test')
subdir('docs')

install_subdir('models', install_dir: 'share/nvalhalla')
install_subdir('nvinfer_configs', install_dir: 'share/nvalhalla')
install_subdir('scripts', install_dir: 'share/nvalhalla')
