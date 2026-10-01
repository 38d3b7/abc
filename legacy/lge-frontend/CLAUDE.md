# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LGE (Liquidity Generation Event) Frontend is a React + TypeScript application for launching and managing token campaigns on Unichain Sepolia. The app integrates with Uniswap v4 hooks and uses Privy for wallet authentication.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production (runs TypeScript compiler + Vite build)
npm run build

# Preview production build
npm run preview
```

## Tech Stack & Architecture

### Core Technologies
- **React 18** with TypeScript (strict mode enabled)
- **Vite** as build tool
- **Privy** (@privy-io/react-auth, @privy-io/wagmi) for wallet authentication
- **Wagmi** + **Viem** for blockchain interactions
- **React Router** v7 for client-side routing
- **TanStack Query** v5 for server state management
- **Axios** for API calls
- **SCSS** for styling (global + component-scoped)
- **React Hot Toast** for notifications

### Blockchain Configuration
- Primary chain: **Unichain Sepolia** (automatically switches users to this chain)
- Also supports Ethereum Mainnet
- Wagmi config defined in `src/wagmi.ts`
- Contract ABIs stored in `src/config/contracts/abis/`
- Contract bytecode stored in `src/config/contracts/bytecode/`
- All contract addresses and environment variables in `src/config/const.ts`

### Application Structure

**Entry Point:** `src/main.tsx`
- Wraps app in PrivyProvider → QueryClientProvider → WagmiProvider → Router
- Privy configured for wallet, email, and SMS login with embedded wallets

**Routing:** `src/App.tsx`
- `/` - CampaignsList (main page)
- `/campaign/:campaignAddress` - CampaignDetail
- `/profile` - UserProfile (user's token holdings)
- `/launches` - UserLaunches (user's created campaigns)
- `/about` - About page

**Layout:** `src/components/Layout.tsx`
- Global navigation with Privy authentication
- Auto-switches users to Unichain Sepolia on connect
- Auto-creates user in backend API on first connection
- Desktop + mobile responsive with hamburger menu
- Integrated CreateCampaign form (toggled via "+ Launch" button)

### API Integration

**Base Configuration:** `src/services/api/config.ts`
- Axios instance (`lgeApi`) with base URL from `VITE_LGE_API_URL`
- API modules in `src/services/api/`:
  - `user.ts` - User CRUD operations
  - `campaign.ts` - Campaign data fetching
  - `price.ts` - Price data fetching
  - `utils.ts` - Shared utilities

### Smart Contract Integration

**Contract Addresses per Chain:**
- Ethereum Sepolia: LGE Manager, Calculations Library, Pool Manager, Position Manager, Permit2, Hook Miner
- Unichain Sepolia: Same contracts as above
- All addresses loaded from environment variables in `src/config/const.ts`

**Contract ABIs:**
- `HookMinerAbi.ts`
- `LGECalculationsLibraryAbi.ts`
- `LGEHookAbi.ts`
- `LGEManagerAbi.ts`
- `LGETokenAbi.ts`

**Bytecode:**
- `LGEHookBytecode.ts`
- `LGETokenBytecode.ts`

### Styling Architecture

**Global Styles:** `src/styles/` (SCSS partials imported via `index.scss`)
- `_variables.scss` - CSS custom properties, colors, spacing
- `_mixins.scss` - Reusable SCSS mixins
- `_base.scss` - Base reset and typography
- `_layout.scss` - Layout and navbar styles
- `_buttons.scss` - Button styles
- `_forms.scss` - Form styles
- `_campaigns.scss` - Campaign-specific styles
- Component-specific partials: `_meme-coin-tile.scss`, `_buy-tokens-modal.scss`, etc.

**Design System:**
- Terminal/Matrix aesthetic theme
- Monospace fonts (JetBrains Mono, Courier New)
- Green primary color with CRT/scanline effects
- CSS custom properties for theming
- Responsive breakpoints for mobile/desktop

### Component Architecture

**Components use functional patterns:**
- Named exports (not default exports)
- TypeScript interfaces for props
- Hooks at top level only
- Guard clauses for early returns
- useCallback/useMemo for optimization

**Key Components:**
- `Layout.tsx` - App shell with navigation and auth
- `CreateCampaign.tsx` - Campaign creation form
- `MemeCoinTileV5/` - Campaign display tile (latest version)
- `BuyTokensModal.tsx` - Token purchase interface
- `ConnectButton.tsx` - Privy wallet connect

## Code Style Rules (from rules.md)

### Standard.js Conventions
- 2-space indentation
- Single quotes
- No semicolons
- Function keyword for components: `export function ComponentName() {}`
- Spaces after keywords and before function parentheses
- camelCase for variables/functions, PascalCase for components/interfaces

### TypeScript Requirements
- Strict mode enabled
- Explicit return types for functions
- No implicit any
- Minimize use of @ts-ignore

### File Organization
- Exported component first
- Subcomponents
- Hooks/helpers
- Static content/types

### Environment Variables
- **NEVER hardcode** API keys, contract addresses, secrets
- All config via `import.meta.env.VITE_*` variables
- Contract addresses loaded in `src/config/const.ts`
- API base URL in `VITE_LGE_API_URL`
- Privy app ID in `VITE_PRIVY_APP_ID`

## Required Environment Variables

Create `.env` file with:
```
VITE_PRIVY_APP_ID=
VITE_LGE_API_URL=

# Ethereum Sepolia
VITE_LGE_MANAGER_ADDRESS_ETH_SEPOLIA=
VITE_LGE_CALCULATIONS_LIBRARY_ETH_SEPOLIA=
VITE_POOL_MANAGER_ETH_SEPOLIA=
VITE_POSITION_MANAGER_ETH_SEPOLIA=
VITE_PERMIT2_ETH_SEPOLIA=
VITE_HOOK_MINER_ETH_SEPOLIA=

# Unichain Sepolia
VITE_LGE_MANAGER_ADDRESS_UNICHAIN_SEPOLIA=
VITE_LGE_CALCULATIONS_LIBRARY_UNICHAIN_SEPOLIA=
VITE_POOL_MANAGER_UNICHAIN_SEPOLIA=
VITE_POSITION_MANAGER_UNICHAIN_SEPOLIA=
VITE_PERMIT2_UNICHAIN_SEPOLIA=
VITE_HOOK_MINER_UNICHAIN_SEPOLIA=
```

## State Management

- **Local state:** useState for component-level state
- **Server state:** TanStack Query for API data caching
- **Blockchain state:** Wagmi hooks (useAccount, useReadContract, useWriteContract, etc.)
- **Global state:** Zustand (when needed - not currently used extensively)

## Current Branch & Recent Work

Working on `feature/terminal-redesign` - implementing matrix-aesthetic terminal UI theme with:
- Retro CRT/terminal styling
- Monospace fonts and green color scheme
- Responsive mobile + desktop layouts
- Geometric campaign tile designs
