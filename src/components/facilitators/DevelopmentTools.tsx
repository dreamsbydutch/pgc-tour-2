import { TanStackDevtools } from "@tanstack/react-devtools";

export function DevelopmentTools() {
  return <TanStackDevtools config={{ position: "bottom-left" }} />;
}
