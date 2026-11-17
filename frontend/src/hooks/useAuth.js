/*
 * FILE: frontend/src/hooks/useAuth.js
 *
 * Custom React hook for accessing shared authentication state.
 *
 * Provides user information, login, registration, logout,
 * loading states, and authentication errors.
 *
 * Must be used inside AuthProvider.
 */

import { useContext } from "react";

import {
  AuthContext,
} from "../context/AuthContext.js";

/*
 * Provides authentication information from AuthContext.
 * Components can call useAuth() instead of using useContext() directly.
 */
export function useAuth() {
  // Read the authentication state and functions from AuthProvider.
  const context = useContext(AuthContext);

  // Show a clear error if the component is outside AuthProvider.
  if (context === null) {
    throw new Error(
      "useAuth must be used inside an AuthProvider.",
    );
  }

  // Return shared authentication state and methods.
  return context;
}