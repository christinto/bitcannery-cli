import fs from 'fs'

// This file will be located in the `build/src` subdirectory during packaging,
// so we're using relative path from there.

export const LegacyContractABI = JSON.parse('' +
  fs.readFileSync(`../../../truffle/build/contracts/CryptoLegacy.json`))

export const RegistryContractABI = JSON.parse('' +
  fs.readFileSync(`../../../truffle/build/contracts/Registry.json`))
