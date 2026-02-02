export const validators = {
  stringLength: (
    str: string | undefined,
    min: number,
    max: number,
    fieldName: string,
  ): string | null => {
    if (!str) return null;
    const trimmed = str.trim();
    if (trimmed.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    if (trimmed.length > max) {
      return `${fieldName} cannot exceed ${max} characters`;
    }
    return null;
  },

  numberRange: (
    num: number | undefined,
    min: number,
    max: number,
    fieldName: string,
  ): string | null => {
    if (num === undefined) return null;
    if (num < min || num > max) {
      return `${fieldName} must be between ${min} and ${max}`;
    }
    return null;
  },

  url: (url: string | undefined, fieldName: string): string | null => {
    if (!url) return null;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return `${fieldName} must be a valid HTTP/HTTPS URL`;
    }
    return null;
  },

  positiveNumber: (
    num: number | undefined,
    fieldName: string,
  ): string | null => {
    if (num === undefined) return null;
    if (num < 0) {
      return `${fieldName} cannot be negative`;
    }
    return null;
  },
};
