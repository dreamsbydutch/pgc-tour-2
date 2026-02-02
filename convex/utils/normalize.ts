export const normalize = {
  email(email: string): string {
    return email.trim().toLowerCase();
  },

  name(name: string): string {
    return name.trim().replace(/\s+/g, " ");
  },
} as const;
