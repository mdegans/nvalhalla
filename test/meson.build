# a list of dicts describing tests
unit_tests = [
  {
    'description': 'Test Nvalhalla.Validate',
    'filename': 'test_validate',
    'sources': ['test_validate.gs', nvalhalla_sources],
  },
  {
    'description': 'Test Nvalhalla.Utils',
    'filename': 'test_utils',
    'sources': ['test_utils.gs', nvalhalla_sources],
  },
]

# build and run tests (on ninja test)
foreach t: unit_tests
  exe = executable(t['filename'], t['sources'],
    dependencies: [nvalhalla_deps, dependency('gstreamer-check-1.0')],
    include_directories: [includes, ds_includes],
  )
  test(t['description'], exe,
    is_parallel: true,
    env: ['GST_DEBUG=5'],
  )
endforeach
