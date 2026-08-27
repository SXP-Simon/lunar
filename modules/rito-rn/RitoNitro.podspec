require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RitoNitro"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported, :visionos => 1.0 }
  s.source       = { :path => '.' }

  s.source_files = [
    "cpp/HybridRitoNitro.{hpp,cpp}",
    "cpp/RitoExecutor.{h,cpp}",
    "cpp/RitoOwnedBuffer.{h,cpp}",
    "cpp/RitoAbiExtensions.h",
    "cpp/RitoPinnedFontAbi.h",
  ]
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'HEADER_SEARCH_PATHS' => '$(PODS_TARGET_SRCROOT)/native/rito/crates/rito-ffi/include'
  }

  load 'nitrogen/generated/ios/RitoNitro+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)

  library_dir = ENV['RITO_FFI_IOS_LIBRARY_DIR']
  if library_dir && !library_dir.empty?
    s.vendored_libraries = "#{library_dir}/librito_ffi.a"
  end
end
