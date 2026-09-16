require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |spec|
  spec.name = 'RitoReactNative'
  spec.version = package['version']
  spec.summary = package['description']
  spec.homepage = 'https://github.com/Ringyuki/Rito'
  spec.license = { :type => 'AGPL-3.0-only' }
  spec.authors = { 'Rito' => 'https://github.com/Ringyuki' }
  spec.platforms = { :ios => '16.4' }
  spec.source = { :path => '.' }
  spec.source_files = '../cpp/**/*.{h,cpp}', 'ios/**/*.{h,mm}'
  spec.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'DEFINES_MODULE' => 'YES'
  }
  spec.dependency 'React-Core'
  spec.dependency 'React-Codegen'
  spec.dependency 'RCT-Folly'

  # RITO_FFI_IOS_LIBRARY_DIR contains per-architecture static libraries built
  # from the Rito 2.0.0 source checkout by the consuming application's script.
  library_dir = ENV['RITO_FFI_IOS_LIBRARY_DIR']
  if library_dir && !library_dir.empty?
    spec.vendored_libraries = "#{library_dir}/librito_ffi.a"
  end
end
