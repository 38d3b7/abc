/**
 * Extract console contract artifacts (bytecode + ABIs) the same way the
 * on-chain e2e script does: the console's generated TS files export the
 * values we need.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONSOLE_DIR = join(__dirname, '../../console/src/config/contracts')

function extractConst (file: string, name: string): `0x${string}` {
  const src = readFileSync(join(CONSOLE_DIR, file), 'utf8')
  const re = new RegExp(name + '\\s*=\\s*["\'](0x[0-9a-fA-F]+)["\']')
  const m = src.match(re)
  if (!m) throw new Error(`const ${name} not found in ${file}`)
  return m[1] as `0x${string}`
}

function extractAbi (file: string): unknown[] {
  const src = readFileSync(join(CONSOLE_DIR, file), 'utf8')
  const start = src.indexOf('[')
  const end = src.lastIndexOf(']')
  return new Function(`return (${src.slice(start, end + 1)})`)() as unknown[]
}

export const LGE_MANAGER = extractConst('addresses.ts', 'LGE_MANAGER_ARC_TESTNET')
export const POOL_MANAGER = extractConst('addresses.ts', 'POOL_MANAGER_ARC_TESTNET')
export const POSITION_MANAGER = extractConst('addresses.ts', 'POSITION_MANAGER_ARC_TESTNET')
export const PERMIT2 = extractConst('addresses.ts', 'PERMIT2_ARC_TESTNET')
export const PROTOCOL = extractConst('addresses.ts', 'PROTOCOL_ARC_TESTNET')
export const VESTING_VAULT = extractConst('addresses.ts', 'VESTING_VAULT_ARC_TESTNET')
export const INFERENCE_ESCROW = extractConst('addresses.ts', 'INFERENCE_ESCROW_ARC_TESTNET')
export const HOOK_BYTECODE = extractConst('bytecode/LGEHookBytecode.ts', 'LGE_HOOK_BYTECODE_ARC_TESTNET')
export const TOKEN_BYTECODE = extractConst('bytecode/LGETokenBytecode.ts', 'LGE_TOKEN_BYTECODE_ARC_TESTNET')
export const MANAGER_ABI = extractAbi('abis/LGEManagerAbi.ts')
export const HOOK_ABI = extractAbi('abis/LGEHookAbi.ts')
export const LIB_ABI = extractAbi('abis/LGECalculationsLibraryAbi.ts')
export const TOKEN_ABI = extractAbi('abis/LGETokenAbi.ts')
