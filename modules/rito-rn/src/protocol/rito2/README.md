These wire decoder files and type declarations come from
`Ringyuki/Rito` tag `@ritojs/core@2.0.0`, commit
`fb6453b16a51665913464b0413e7d9a08d73fdc4`, under AGPL-3.0-only.

The JavaScript decoder is copied from `packages/rito-core-wasm/src/`.
The TypeScript types are copied from `packages/rito-core-wasm/src/types/`.
Update this directory alongside `native/rito` and the React Native adapter
when the pinned Rito revision changes. The Rust-generated fixture at
`tests/fixtures/rito-2-primitive-list.hex` checks decoder compatibility.
