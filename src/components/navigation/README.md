# Navigation Components

Clean navigation system for PGC app with TanStack Router, Clerk auth, and Convex backend.

## Structure

```
navigation/
├── NavigationContainer.tsx    # Main navigation component
├── NavItem.tsx               # Individual nav items
├── UserAccountNav.tsx        # User authentication & account
├── SignInButton.tsx          # Sign-in button
├── ErrorBoundary.tsx         # Error handling
├── types.ts                  # TypeScript types
├── utils.ts                  # Utility functions
└── index.ts                  # Exports
```

## Usage

```tsx
import { NavigationContainer } from "./components/navigation";

function App() {
  return <NavigationContainer />;
}
```

## Features

- Responsive design (mobile bottom nav, desktop top nav)
- Active page highlighting
- Clerk authentication integration
- Error boundaries
- Accessibility (ARIA labels, keyboard nav)
- Loading states

## Key Components

- **NavigationContainer**: Main nav with responsive layout
- **NavItem**: Individual nav links with active states
- **UserAccountNav**: User profile, balance, auth states
- **SignInButton**: Clerk sign-in with loading state
- **ErrorBoundary**: Graceful error handling with retry
