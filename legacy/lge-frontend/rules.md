# React/TypeScript Frontend Development Rules

## Code Style & Structure

- Write concise, technical TypeScript following Standard.js conventions
- Use functional, declarative patterns; avoid classes
- Favor iteration and small helper modules over code duplication
- Use descriptive names with auxiliary verbs (isLoading, hasError, canSubmit)
- **File structure order**: exported component → subcomponents → hooks/helpers → static content/types

## TypeScript Configuration

- Enable `"strict": true` in tsconfig.json
- Explicitly type all function returns and object literals
- Enforce: noImplicitAny, strictNullChecks, strictFunctionTypes
- Minimize @ts-ignore/@ts-expect-error usage (document when unavoidable)

## Standard.js Code Conventions

- 2-space indentation
- Single quotes (except when escaping quotes inside strings)
- No semicolons (unless required for disambiguation)
- No unused variables
- Space after keywords: `if (condition)`
- Space before function parentheses: `function name (args)`
- Always use `===` and `!==` (never `==` or `!=`)
- Operators must be spaced: `a + b` not `a+b`
- Commas followed by space: `[1, 2, 3]`
- `else` on same line as closing brace: `} else {`
- Multi-line if blocks always use braces
- Always handle error callback parameters
- camelCase for variables/functions; PascalCase for components/interfaces

## Project Structure & Organization

- **Directories**: lowercase-with-dashes (e.g., `components/auth-wizard`)
- **File extensions**:
  - Components: `.tsx`
  - Hooks/Utils: `.ts`
  - Style modules: `.module.scss`
- Prefer named exports for components
- Types/Interfaces in PascalCase (User, ButtonProps)
- **Configuration folder structure**:
  - Create a `config/` directory for application configuration
  - Store ABIs in `config/abis/` (e.g., `config/abis/TokenContract.json`)
  - Store bytecode in `config/bytecode/` (e.g., `config/bytecode/TokenContract.json`)
  - Store constants in `config/constants.ts` (e.g., chain IDs, contract addresses from env)
  - Keep configuration separate from business logic

## React + TypeScript Patterns

- Define props with TypeScript interfaces/types (never prop-types)
- Use function keyword for component declarations:

```tsx
interface ButtonProps {
  label: string;
  onClick?: () => void;
}

export function Button({ label, onClick }: ButtonProps) {
  return <button onClick={onClick}>{label}</button>;
}
```

- Call hooks (useState, useEffect) only at component top level
- Extract reusable logic into custom hooks (useAuth, useFormValidation)
- Memoize strategically: React.memo, useCallback, useMemo
- Avoid inline functions in JSX—extract handlers or wrap in useCallback
- Favor composition (render props, children) over inheritance
- Use React.lazy + Suspense for code splitting
- Use refs only for direct DOM manipulation
- Prefer controlled components for forms
- Implement error boundary components
- Clean up effects in useEffect return function to prevent memory leaks
- Use guard clauses (early returns) for error handling

## State Management

- **Global state**: Zustand
- Lift state up before introducing context
- Use React Context for intermediate, tree-wide state sharing
- Keep state as local as possible

## UI & Styling (SCSS Modules)

- Co-locate `.module.scss` file with each component
- Leverage SCSS features:
  - Variables: `$primary-color`, `$spacing-unit`
  - Mixins: `@mixin flexCenter { ... }`
  - Parent selector: `&:hover`, `&.active`
  - Partials: `_variables.scss`, `_mixins.scss` imported in `styles/index.scss`
- Name classes in camelCase or BEM (`.card__header`, `.button--primary`)
- Keep global styles minimal (reset, typography, CSS variables only)

## Performance Optimization

- Minimize unnecessary client-only code (useEffect/useState)
- Dynamically import non-critical components
- Optimize images: use WebP, specify width/height, implement lazy loading
- Memoize expensive computations with useMemo
- Wrap pure components in React.memo
- Structure imports for effective tree-shaking

## Forms & Validation

- Use controlled inputs with state
- Simple forms: write custom hooks
- Complex forms: use react-hook-form with TypeScript generics
- Separate client-side and server-side validation logic
- Consider schema validation libraries (Zod, Yup) for complex validation

## Error Handling

- Validate inputs and preconditions early with guard clauses
- Place happy-path logic last in functions
- Provide clear, user-friendly error messages
- Log unexpected errors to monitoring service
- Use try-catch for async operations
- Implement error boundaries for component trees

## Accessibility (a11y)

- Use semantic HTML elements (`<nav>`, `<main>`, `<button>`)
- Apply appropriate ARIA attributes when semantic HTML insufficient
- Ensure full keyboard navigation (tab order, focus states)
- Provide alt text for images
- Use proper heading hierarchy (h1-h6)
- Ensure sufficient color contrast

## Security & Configuration

- **Never hardcode sensitive values**: API keys, contract addresses, secrets, tokens
- Store all sensitive configuration in environment variables (`.env` files)
- Use process.env or import.meta.env for accessing environment variables
- Keep `.env` files out of version control (add to `.gitignore`)
- Use `.env.example` to document required environment variables
- Validate required environment variables at build/runtime
- **Configuration organization**:
  - Use `config/` folder for ABIs, bytecode, and constants
  - Reference environment variables from constants file
  - Keep blockchain-specific configuration isolated

## Configuration Folder Structure

```
config/
├── abis/
│   ├── TokenContract.json
│   ├── NFTContract.json
│   └── StakingContract.json
├── bytecode/
│   ├── TokenContract.json
│   └── NFTContract.json
└── constants.ts
```

## Example Environment Variable Usage

```typescript
// ❌ BAD - Hardcoded
const API_KEY = "sk_live_abc123";
const CONTRACT_ADDRESS = "0x1234...";

// ✅ GOOD - Environment variables
const API_KEY = process.env.VITE_API_KEY;
const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS;

// Validate at startup
if (!API_KEY || !CONTRACT_ADDRESS) {
  throw new Error("Missing required environment variables");
}
```

## Example Constants File

```typescript
// config/constants.ts
export const CHAIN_IDS = {
  MAINNET: 1,
  SEPOLIA: 11155111,
  POLYGON: 137,
  POLYGON_MUMBAI: 80001,
} as const;

export const CONTRACT_ADDRESSES = {
  TOKEN: process.env.VITE_TOKEN_CONTRACT_ADDRESS,
  NFT: process.env.VITE_NFT_CONTRACT_ADDRESS,
  STAKING: process.env.VITE_STAKING_CONTRACT_ADDRESS,
} as const;

export const API_CONFIG = {
  BASE_URL: process.env.VITE_API_BASE_URL,
  API_KEY: process.env.VITE_API_KEY,
  TIMEOUT: 30000,
} as const;

// Validate required environment variables
const requiredEnvVars = [
  "VITE_TOKEN_CONTRACT_ADDRESS",
  "VITE_NFT_CONTRACT_ADDRESS",
  "VITE_API_BASE_URL",
];

requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
});
```

## Example ABI/Bytecode Usage

```typescript
// hooks/useTokenContract.ts
import { useContract } from "wagmi";
import TokenContractABI from "@/config/abis/TokenContract.json";
import { CONTRACT_ADDRESSES } from "@/config/constants";

export function useTokenContract() {
  return useContract({
    address: CONTRACT_ADDRESSES.TOKEN,
    abi: TokenContractABI,
  });
}
```

## Component Example

```tsx
// components/user-profile/UserProfile.tsx
import { useState, useCallback } from "react";
import styles from "./UserProfile.module.scss";

interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

interface User {
  id: string;
  name: string;
  email: string;
}

export function UserProfile({ userId, onUpdate }: UserProfileProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdate = useCallback(
    (updatedUser: User) => {
      setUser(updatedUser);
      onUpdate?.(updatedUser);
    },
    [onUpdate]
  );

  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (!user) {
    return <div className={styles.error}>User not found</div>;
  }

  return (
    <div className={styles.profile}>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}
```
