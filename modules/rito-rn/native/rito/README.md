# Vendored Rito Rust workspace

This directory contains the minimal Rito 2.0.0 Rust workspace needed by
`rito-ffi`. It is kept with `@ritojs/react-native` so Android and iOS builds
have the same source tree after the package is installed.

The snapshot comes from Rito commit
`fb6453b16a51665913464b0413e7d9a08d73fdc4`, tagged
`@ritojs/core@2.0.0`. From the Lunar repository, run
`pnpm run sync:rito-native` with `RITO_SOURCE_DIR` pointing to that checkout.

The `target` directory is machine-local build output and is excluded from
source packages. Cargo rebuilds the static library when its inputs change.

Changed in commit: 5199ba8af02b86e3922911810d70907a9916fa59
e5eb8ffc38741fd58f13d224a38aac8cd6f4a136
17e4c0b637931c333467b252563e8f1b5e28288a
ff3f365af0617569758ddbe37288a32ff3b501d8
