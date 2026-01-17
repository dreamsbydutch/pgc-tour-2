# Admin Authorization Strategy

This document outlines the authorization rules for all tables in the PGC system.

## Authorization Roles

- **Regular User**: Authenticated member with `role: "regular"`
- **Moderator**: Member with `role: "moderator"` - can manage content like golfers, tournaments
- **Admin**: Member with `role: "admin"` - full access to all resources

## Table-by-Table Authorization

### Core League Structure (Admin Only)

These tables define the league structure and should only be modified by admins:

#### `seasons`

- **Create**: Admin only
- **Read**: Anyone (unauthenticated OK for public season info)
- **Update**: Admin only
- **Delete**: Admin only

#### `tours`

- **Create**: Admin only
- **Read**: Anyone
- **Update**: Admin only
- **Delete**: Admin only

#### `tiers`

- **Create**: Admin only
- **Read**: Anyone
- **Update**: Admin only
- **Delete**: Admin only

#### `courses`

- **Create**: Admin only
- **Read**: Anyone
- **Update**: Admin only
- **Delete**: Admin only

### Tournament Management (Admin/Moderator)

#### `tournaments`

- **Create**: Admin only
- **Read**: Anyone
- **Update**: Admin only
- **Delete**: Admin only

#### `tournamentGolfers` (golfer performance in specific tournaments)

- **Create**: Moderator or Admin (moderators manage tournament data)
- **Read**: Anyone
- **Update**: Moderator or Admin
- **Delete**: Moderator or Admin

### Player Data (Moderator for writes)

#### `golfers`

- **Create**: Moderator or Admin
- **Read**: Anyone
- **Update**: Moderator or Admin
- **Delete**: Moderator or Admin

### Member Resources (Self or Admin)

Users can only access their own resources. Admins can access all.

#### `teams` (fantasy team picks)

- **Create**: Own resource only (or admin)
- **Read**: Anyone (for leaderboards)
- **Update**: Own resource only (or admin)
- **Delete**: Own resource only (or admin)

#### `tourCards` (member participation in tours)

- **Create**: Own resource only (or admin)
- **Read**: Anyone (for standings)
- **Update**: Own resource only (or admin)
- **Delete**: Own resource only (or admin)

#### `transactions`

- **Create**: Admin only (financial operations)
- **Read**: Own transactions only (or admin)
- **Update**: Admin only
- **Delete**: Admin only

#### `pushSubscriptions`

- **Create**: Own resource only
- **Read**: Own resource only (or admin)
- **Update**: Own resource only (or admin)
- **Delete**: Own resource only (or admin)

### Member Management (Special Rules)

#### `members`

- **Create**: Admin only (or self-registration via Clerk webhook)
- **Read**:
  - Self: Full details
  - Others: Public profile only (name, role, account balance)
  - Admin: Full details for all
- **Update**:
  - Self: Limited fields (firstname, lastname, email)
  - Admin: All fields including role, account balance
- **Delete**: Admin only (hard delete)

### System Tables (Admin Only Writes)

#### `settings`

- **Create**: Admin only
- **Read**: Public settings (isPublic: true) anyone, private settings admin only
- **Update**: Admin only
- **Delete**: Admin only

#### `auditLogs`

- **Create**: System only (automated)
- **Read**: Admin only
- **Update**: Not allowed (immutable)
- **Delete**: Admin only (for GDPR compliance)

## Implementation Pattern

### Using Auth Helpers

```typescript
import { requireAuth, requireAdmin, requireModerator, requireOwnResource } from "../auth";

// Admin-only create
export const createSeasons = mutation({
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    // ... create logic
  }
});

// Self or admin access
export const updateTeams = mutation({
  args: {
    teamId: v.id("teams"),
    data: v.object({...})
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    // Get associated tourCard to check ownership
    const tourCard = await ctx.db.get(team.tourCardId);
    if (!tourCard) throw new Error("TourCard not found");

    await requireOwnResource(ctx, tourCard.clerkId);
    // ... update logic
  }
});
```

### Public Read Operations

For queries that should be publicly accessible (like viewing tournament standings), we don't require auth:

```typescript
export const getSeasons = query({
  handler: async (ctx, args) => {
    // No auth required - public read
    return await ctx.db.query("seasons").collect();
  },
});
```

### Self vs Admin Access

For reads that show different data based on user role:

```typescript
export const getMembers = query({
  handler: async (ctx, args) => {
    const currentClerkId = await getAuthClerkId(ctx);
    const isAdminUser = await isAdmin(ctx);

    const members = await ctx.db.query("members").collect();

    // Filter sensitive data for non-admins
    if (!isAdminUser) {
      return members.map((m) => ({
        _id: m._id,
        firstname: m.firstname,
        lastname: m.lastname,
        role: m.role,
        // Hide sensitive fields like email, account for other users
      }));
    }

    return members;
  },
});
```

## Migration Notes

- Existing functions that accept `clerkId` parameters are being updated to use `ctx.auth` instead
- This prevents clients from spoofing their identity
- Frontend code should not pass `clerkId` - the backend derives it from auth context

## Testing

After implementing auth:

1. Test unauthenticated access (should fail for protected operations)
2. Test regular user access (can only access own resources)
3. Test moderator access (can manage content)
4. Test admin access (full access)
