"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";

import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";

type ViewerBootstrapValue =
  | FunctionReturnType<typeof api.functions.readModels.getViewerBootstrap>
  | undefined;

const ViewerBootstrapContext = createContext<ViewerBootstrapValue>(undefined);

export function ViewerBootstrapProvider(props: { children: ReactNode }) {
  const bootstrap = useQuery(api.functions.readModels.getViewerBootstrap);
  return (
    <ViewerBootstrapContext.Provider value={bootstrap}>
      {props.children}
    </ViewerBootstrapContext.Provider>
  );
}

export function useViewerBootstrap() {
  return useContext(ViewerBootstrapContext);
}
