"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useUser } from "@clerk/tanstack-react-start";

import { api } from "convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { ViewerBootstrapValue } from "@/types";

const ViewerBootstrapContext = createContext<ViewerBootstrapValue>(undefined);

export function ViewerBootstrapProvider(props: { children: ReactNode }) {
  const { user, isLoaded: isClerkLoaded } = useUser();
  const convexAuth = useConvexAuth();
  const ensureMember = useMutation(api.functions.members.ensureCurrentMember);
  const ensuredSubjectRef = useRef<string | null>(null);
  const bootstrap = useQuery(api.functions.readModels.getViewerBootstrap);

  useEffect(() => {
    if (!isClerkLoaded || convexAuth.isLoading) return;
    if (!user || !convexAuth.isAuthenticated) {
      ensuredSubjectRef.current = null;
      return;
    }
    if (ensuredSubjectRef.current === user.id) return;

    ensuredSubjectRef.current = user.id;
    void ensureMember({}).catch(() => {
      ensuredSubjectRef.current = null;
    });
  }, [
    convexAuth.isAuthenticated,
    convexAuth.isLoading,
    ensureMember,
    isClerkLoaded,
    user,
  ]);

  return (
    <ViewerBootstrapContext.Provider value={bootstrap}>
      {props.children}
    </ViewerBootstrapContext.Provider>
  );
}

export function useViewerBootstrap() {
  return useContext(ViewerBootstrapContext);
}
