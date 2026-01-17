# Frontend Authorization Guide

This document explains how to work with the authorization system in the PGC frontend.

## Overview

The backend uses server-side identity derivation via `ctx.auth.getUserIdentity()` from Clerk. The frontend no longer needs to pass `clerkId` to mutations - only to queries where it's used as a filter parameter.

## Role-Based Access Hooks

### `useRoleAccess()`

Get the current user's role and check permissions:

```tsx
import { useRoleAccess } from "@/hooks/useRoleAccess";

function MyComponent() {
  const { role, isAdmin, isModerator, isLoading, isAuthenticated } =
    useRoleAccess();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {isAdmin && <AdminPanel />}
      {isModerator && <ModeratorTools />}
      {role && <span>Role: {role}</span>}
    </div>
  );
}
```

**Returns:**

- `role`: 'admin' | 'moderator' | 'regular' | null
- `isAdmin`: boolean
- `isModerator`: boolean
- `isLoading`: boolean
- `isAuthenticated`: boolean

### `useCanAccessResource()`

Check if the user can access a specific resource:

```tsx
import { useCanAccessResource } from "@/hooks/useRoleAccess";

function TeamEditor({ team }) {
  const canEdit = useCanAccessResource(team.memberId);

  return (
    <div>
      {canEdit ? (
        <button>Edit Team</button>
      ) : (
        <p>You can only edit your own teams</p>
      )}
    </div>
  );
}
```

**Parameters:**

- `resourceOwnerId`: string | undefined - The clerkId of the resource owner

**Returns:**

- boolean - true if user is admin or owns the resource

## Error Handling

### Parse Authorization Errors

```tsx
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { parseError, isAuthError } from "@/lib/errorHandling";

function CreateSeasonButton() {
  const createSeason = useMutation(api.functions.seasons.createSeason);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    try {
      await createSeason({
        data: { name: "2024 Season", year: 2024 },
      });
      // Success!
    } catch (err) {
      const errorInfo = parseError(err);

      if (errorInfo.isAuth) {
        setError("You don't have permission to create seasons");
      } else if (errorInfo.isValidation) {
        setError(`Invalid data: ${errorInfo.message}`);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div>
      <button onClick={handleCreate}>Create Season</button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

**Error Utilities:**

- `parseError(err)` - Parse any error into structured format
- `isAuthError(err)` - Check if error is authorization-related
- `getErrorMessage(err)` - Get user-friendly error message

## Query Patterns

### Queries with clerkId (CORRECT)

Queries may still accept `clerkId` as a filter parameter. This is safe because:

1. The server validates permissions
2. `clerkId` is used to filter results, not to impersonate

```tsx
// ✅ CORRECT: clerkId used as filter
const member = useQuery(
  api.functions.members.getMember,
  user ? { clerkId: user.id } : "skip",
);

const teams = useQuery(
  api.functions.teams.getTeams,
  member ? { memberId: member._id } : "skip",
);
```

### Mutations without clerkId (CORRECT)

Mutations derive identity server-side via `ctx.auth.getUserIdentity()`:

```tsx
// ✅ CORRECT: No clerkId parameter
const createTeam = useMutation(api.functions.teams.createTeam);

await createTeam({
  data: {
    name: "Team Eagles",
    tournamentId: tournament._id,
    golferIds: selectedGolfers
  }
});

// ❌ INCORRECT: Don't pass clerkId to mutations
await createTeam({
  clerkId: user.id, // DON'T DO THIS
  data: { ... }
});
```

## Component Patterns

### Admin-Only UI

```tsx
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { AdminPanel } from "@/components";

function AdminSection() {
  const { isAdmin, isLoading } = useRoleAccess();

  if (isLoading) return <Skeleton />;
  if (!isAdmin) return null;

  return <AdminPanel />;
}
```

### Moderator-Only UI

```tsx
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { ModeratorTools } from "@/components";

function ModeratorSection() {
  const { isModerator, isAdmin, isLoading } = useRoleAccess();

  if (isLoading) return <Skeleton />;
  if (!isModerator && !isAdmin) return null; // Admins can also moderate

  return <ModeratorTools />;
}
```

### Resource Owner UI

```tsx
import { useCanAccessResource } from "@/hooks/useRoleAccess";

function TeamControls({ team }) {
  const canEdit = useCanAccessResource(team.memberId);

  return (
    <div>
      {canEdit && (
        <>
          <button>Edit</button>
          <button>Delete</button>
        </>
      )}
    </div>
  );
}
```

## Role Badges

Display user roles in the UI:

```tsx
import { useRoleAccess } from "@/hooks/useRoleAccess";

function UserRoleBadge() {
  const { role, isLoading } = useRoleAccess();

  if (isLoading || !role || role === "regular") return null;

  const badgeStyles = {
    admin: "bg-red-500 text-white",
    moderator: "bg-blue-500 text-white",
  };

  return (
    <span className={`rounded px-2 py-1 text-sm ${badgeStyles[role]}`}>
      {role === "admin" ? "Administrator" : "Moderator"}
    </span>
  );
}
```

## Common Patterns

### Form Submission with Error Handling

```tsx
function CreateTournamentForm() {
  const createTournament = useMutation(
    api.functions.tournaments.createTournament,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (formData: TournamentFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await createTournament({
        data: {
          name: formData.name,
          startDate: formData.startDate,
          tourId: formData.tourId,
        },
      });

      // Success - redirect or show success message
      router.push("/tournaments");
    } catch (err) {
      const { isAuth, isValidation, message } = parseError(err);

      if (isAuth) {
        setError("You don't have permission to create tournaments");
      } else if (isValidation) {
        setError(message);
      } else {
        setError("Failed to create tournament. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      {error && <ErrorAlert message={error} />}
      <button disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create Tournament"}
      </button>
    </form>
  );
}
```

### Conditional Navigation Links

```tsx
import { useRoleAccess } from "@/hooks/useRoleAccess";

function Navigation() {
  const { isAdmin, isModerator } = useRoleAccess();

  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/standings">Standings</Link>
      <Link to="/tournament">Tournament</Link>

      {isModerator && <Link to="/manage-golfers">Manage Golfers</Link>}
      {isAdmin && <Link to="/admin">Admin Panel</Link>}
    </nav>
  );
}
```

## Migration from Old Pattern

### Before (with clerkId in mutations)

```tsx
// ❌ OLD PATTERN - DON'T USE
const createTeam = useMutation(api.functions.teams.createTeam);
const { user } = useUser();

await createTeam({
  clerkId: user.id,
  data: { name: "Team Eagles", ... }
});
```

### After (server-side auth)

```tsx
// ✅ NEW PATTERN - USE THIS
const createTeam = useMutation(api.functions.teams.createTeam);

await createTeam({
  data: { name: "Team Eagles", ... }
});
```

The server derives the authenticated user via `ctx.auth.getUserIdentity()` automatically.

## Authorization Errors

When operations fail due to authorization, you'll receive errors like:

- `"Unauthorized: Admin access required"`
- `"Unauthorized: Moderator access required"`
- `"Unauthorized: You can only access your own resources"`
- `"Unauthorized: You must be signed in"`

Use `parseError()` to handle these gracefully:

```tsx
const { isAuth, message } = parseError(error);
if (isAuth) {
  // Show permission denied UI
  toast.error("You don't have permission for this action");
}
```

## Best Practices

1. **Always use `useRoleAccess` for role-based UI** - Don't try to derive roles from other sources
2. **Handle authorization errors gracefully** - Use `parseError()` for user-friendly messages
3. **Hide unauthorized UI** - Don't show buttons/links users can't use
4. **Don't pass `clerkId` to mutations** - Server derives identity automatically
5. **Check resource ownership** - Use `useCanAccessResource()` for user-specific resources
6. **Show loading states** - `useRoleAccess` returns `isLoading` while checking permissions
7. **Admins bypass all checks** - Remember admins have full access when designing UI

## Security Notes

- **Client-side checks are UI hints only** - Server always enforces authorization
- **Never trust client-provided identity** - Server uses `ctx.auth` as source of truth
- **Hide UI to improve UX** - Users shouldn't see options they can't use
- **Backend is the security boundary** - Frontend checks are for user experience
