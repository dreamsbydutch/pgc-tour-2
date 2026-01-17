"use client";

import { useState, useCallback } from "react";
import { SignInButton as ClerkSignInButton } from "@clerk/tanstack-react-start";
import { Button } from "../ui/button";
import { LogIn } from "lucide-react";

export function SignInButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 3000);
  }, []);

  return (
    <ClerkSignInButton mode="modal">
      <Button
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={handleClick}
        className="flex items-center gap-2 transition-all duration-200"
        aria-label="Sign in to your account"
      >
        {isLoading ? (
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden="true"
          />
        ) : (
          <LogIn className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden lg:inline">Sign In</span>
      </Button>
    </ClerkSignInButton>
  );
}
