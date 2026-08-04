import type { FunctionReturnType } from "convex/server";

import type { api } from "convex/_generated/api";

export type ViewerBootstrapDto = FunctionReturnType<
  typeof api.functions.readModels.getViewerBootstrap
>;

export type ViewerMemberDto = NonNullable<ViewerBootstrapDto["member"]>;
export type ViewerTourCardDto = ViewerBootstrapDto["tourCards"][number];

export type TourCardSelfServiceDto = ViewerBootstrapDto["tourCardSelfService"];
export type ViewerBootstrapValue = ViewerBootstrapDto | undefined;
