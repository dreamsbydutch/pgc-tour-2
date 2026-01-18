import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FriendManagementHook, StandingsMember } from "@/lib/types";

function getFriendIds(member: StandingsMember | null | undefined): string[] {
  if (!member?.friends?.length) return [];
  return member.friends.map((v: string) => String(v));
}

export function useFriendManagement(
  currentMember: StandingsMember | null | undefined,
  currentMemberClerkId: string | undefined,
): FriendManagementHook {
  const [friendChangingIds, setFriendChangingIds] = useState<Set<string>>(
    () => new Set(),
  );

  const updateMember = useMutation(api.functions.members.updateMembers);

  const currentFriends = useMemo(
    () => getFriendIds(currentMember),
    [currentMember],
  );

  const addToChangingSet = useCallback((clerkId: string) => {
    setFriendChangingIds((prev) => new Set([...prev, clerkId]));
  }, []);

  const removeFromChangingSet = useCallback((clerkId: string) => {
    setFriendChangingIds((prev) => {
      const next = new Set(prev);
      next.delete(clerkId);
      return next;
    });
  }, []);

  const addFriend = useCallback(
    async (memberIdToAdd: string) => {
      if (!currentMember || !currentMemberClerkId) return;
      if (memberIdToAdd === String(currentMember._id)) return;
      if (friendChangingIds.has(memberIdToAdd)) return;

      addToChangingSet(memberIdToAdd);

      try {
        const nextFriends = Array.from(
          new Set([...currentFriends, memberIdToAdd]),
        );

        await updateMember({
          clerkId: currentMemberClerkId,
          memberId: currentMember._id,
          data: { friends: nextFriends },
        });
      } finally {
        removeFromChangingSet(memberIdToAdd);
      }
    },
    [
      addToChangingSet,
      currentFriends,
      currentMember,
      currentMemberClerkId,
      friendChangingIds,
      removeFromChangingSet,
      updateMember,
    ],
  );

  const removeFriend = useCallback(
    async (memberIdToRemove: string) => {
      if (!currentMember || !currentMemberClerkId) return;
      if (friendChangingIds.has(memberIdToRemove)) return;

      addToChangingSet(memberIdToRemove);

      try {
        const nextFriends = currentFriends.filter(
          (id) => id !== memberIdToRemove,
        );

        await updateMember({
          clerkId: currentMemberClerkId,
          memberId: currentMember._id,
          data: { friends: nextFriends },
        });
      } finally {
        removeFromChangingSet(memberIdToRemove);
      }
    },
    [
      addToChangingSet,
      currentFriends,
      currentMember,
      currentMemberClerkId,
      friendChangingIds,
      removeFromChangingSet,
      updateMember,
    ],
  );

  return {
    state: {
      friendChangingIds,
      isUpdating: friendChangingIds.size > 0,
    },
    actions: {
      addFriend,
      removeFriend,
    },
  };
}
