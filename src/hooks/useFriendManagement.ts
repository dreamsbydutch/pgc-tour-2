import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/convex";
import type { FriendableMember, FriendManagementHook } from "@/types";

function getFriendIds(member: FriendableMember | null | undefined): string[] {
  if (!member?.friends?.length) return [];
  return member.friends.map((v: string) => String(v));
}

export function useFriendManagement(
  currentMember: FriendableMember | null | undefined,
  currentMemberClerkId: string | undefined,
): FriendManagementHook {
  const [friendChangingIds, setFriendChangingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [friendIds, setFriendIds] = useState<Set<string>>(
    () => new Set(getFriendIds(currentMember)),
  );

  const addMyFriend = useMutation(api.functions.members.addMyFriend);
  const removeMyFriend = useMutation(api.functions.members.removeMyFriend);

  const currentFriends = useMemo(
    () => getFriendIds(currentMember),
    [currentMember],
  );

  useEffect(() => {
    setFriendIds(new Set(currentFriends));
  }, [currentFriends]);

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
      const nextFriends = Array.from(new Set([...friendIds, memberIdToAdd]));
      setFriendIds(new Set(nextFriends));

      try {
        await addMyFriend({ memberId: memberIdToAdd as Id<"members"> });
      } catch (error) {
        setFriendIds((prev) => {
          const next = new Set(prev);
          next.delete(memberIdToAdd);
          return next;
        });
        console.error("Failed to add friend", error);
        throw error;
      } finally {
        removeFromChangingSet(memberIdToAdd);
      }
    },
    [
      addToChangingSet,
      currentMember,
      currentMemberClerkId,
      friendIds,
      friendChangingIds,
      removeFromChangingSet,
      addMyFriend,
    ],
  );

  const removeFriend = useCallback(
    async (memberIdToRemove: string) => {
      if (!currentMember || !currentMemberClerkId) return;
      if (friendChangingIds.has(memberIdToRemove)) return;

      addToChangingSet(memberIdToRemove);
      const nextFriends = Array.from(friendIds).filter(
        (id) => id !== memberIdToRemove,
      );
      setFriendIds(new Set(nextFriends));

      try {
        await removeMyFriend({
          memberId: memberIdToRemove as Id<"members">,
        });
      } catch (error) {
        setFriendIds((prev) => new Set([...prev, memberIdToRemove]));
        console.error("Failed to remove friend", error);
        throw error;
      } finally {
        removeFromChangingSet(memberIdToRemove);
      }
    },
    [
      addToChangingSet,
      currentMember,
      currentMemberClerkId,
      friendIds,
      friendChangingIds,
      removeFromChangingSet,
      removeMyFriend,
    ],
  );

  return {
    state: {
      friendChangingIds,
      friendIds,
      isUpdating: friendChangingIds.size > 0,
    },
    actions: {
      addFriend,
      removeFriend,
    },
  };
}
