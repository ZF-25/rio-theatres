/*
 * FILE: frontend/src/store/useStaffStore.js
 *
 * Custom React hook for accessing the shared demo staff store.
 *
 * Provides staff accounts, login state, and staff management actions.
 * Uses the same store instance across all staff components.
 */

import {
  useSyncExternalStore,
} from "react";

import {
  demoStaffStore,
} from "../services/demoStaffStore.js";

/*
 * Connect React components to the shared demo staff store.
 * Components automatically update when the store changes.
 */
export function useStaffStore() {
  // Subscribe to changes and retrieve the latest store state.
  const state = useSyncExternalStore(
    demoStaffStore.subscribe,
    demoStaffStore.getSnapshot,

    // Snapshot used if server-side rendering is introduced.
    demoStaffStore.getSnapshot,
  );

  // Return the current state and available staff actions.
  return {
    ...state,
    ...demoStaffStore,
  };
}