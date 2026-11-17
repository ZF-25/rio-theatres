/*
 * FILE: frontend/src/context/AuthContext.js
 *
 * Creates the shared authentication context for Rio Theaters.
 *
 * React Context allows components to access authentication
 * information without passing it through multiple props.
 *
 * AuthProvider manages the state, while useAuth() accesses it.
 */

import { createContext } from "react";

// Create the authentication context with null as its default value.
// useAuth() checks this to ensure components are inside AuthProvider.
export const AuthContext = createContext(null);

// Give the context a readable name in React Developer Tools.
AuthContext.displayName = "AuthContext";