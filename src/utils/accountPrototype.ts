export function shouldShowAccountPrototype(args: {
  isDevelopment: boolean;
  vercelEnvironment?: string;
}) {
  return args.isDevelopment || args.vercelEnvironment === "preview";
}

export const ACCOUNT_PROTOTYPE_ENABLED = shouldShowAccountPrototype({
  isDevelopment: import.meta.env.DEV,
  vercelEnvironment: import.meta.env.VITE_VERCEL_ENV,
});
