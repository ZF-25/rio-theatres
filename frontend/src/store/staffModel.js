/*
 * FILE: frontend/src/store/staffModel.js
 *
 * Manages demo staff accounts, login sessions, and theater assignments.
 *
 * Owners manage cashier accounts.
 * Cashiers can have zero or one assigned theater.
 *
 * All demo data is stored in memory and resets on refresh.
 */

export function createStaffStore({
  allowedTheaterIds = [
    "cinema-oulu",
    "cinema-tampere",
  ],
} = {}) {
  // Store subscribers and valid theater IDs.
  const listeners = new Set();
  const knownTheaterIds = new Set(allowedTheaterIds);

  /*
   * Add display and compatibility fields to an account.
   * theaterId remains the source of truth for assignments.
   */
  function withDisplayName(account) {
    return {
      ...account,

      name: [account.firstName, account.lastName]
        .filter(Boolean)
        .join(" "),

      // Support older components that expect theaterIds.
      ...(account.role === "cashier"
        ? {
            theaterIds:
              account.theaterId === null
                ? []
                : [account.theaterId],
          }
        : {}),
    };
  }

  // Return a copy so callers cannot modify theater assignments.
  function copyAccount(account) {
    return {
      ...account,

      ...(account.role === "cashier"
        ? {
            theaterIds:
              account.theaterId === null
                ? []
                : [account.theaterId],
          }
        : {}),
    };
  }

  // Create the default demo owner account.
  const ownerAccount = withDisplayName({
    id: "demo-owner",
    firstName: "Company",
    lastName: "Owner",
    email: "owner@rio-theaters.example",
    role: "admin",
    active: true,
  });

  // Store demo passwords separately from account profiles.
  const passwords = new Map([
    [ownerAccount.id, "RioOwner123!"],
  ]);

  // Initial staff accounts and login session.
  let state = {
    accounts: [ownerAccount],
    currentStaff: null,
  };

  // Update the store and notify subscribed components.
  function publish(nextState) {
    state = nextState;

    listeners.forEach((listener) => {
      listener();
    });
  }

  // Standardise email addresses for comparisons.
  function normalizeEmail(value) {
    return typeof value === "string"
      ? value.trim().toLowerCase()
      : "";
  }

  // Remove unnecessary spaces from names.
  function cleanName(value) {
    return typeof value === "string"
      ? value.trim()
      : "";
  }

  // Check whether the active demo owner is signed in.
  function ownerIsSignedIn() {
    const account = state.accounts.find(
      (item) => item.id === state.currentStaff?.id,
    );

    return Boolean(
      account &&
      account.active &&
      account.role === "admin",
    );
  }

  // Return a standard error for owner-only operations.
  function ownerRequiredError() {
    return {
      error:
        "Sign in as the company owner to manage cashier accounts.",
    };
  }

  /*
   * Replace an existing account.
   * Update its session copy or sign it out if deactivated.
   */
  function replaceAccount(updatedAccount) {
    publish({
      ...state,

      accounts: state.accounts.map((account) =>
        account.id === updatedAccount.id
          ? updatedAccount
          : account,
      ),

      currentStaff:
        state.currentStaff?.id === updatedAccount.id
          ? updatedAccount.active
            ? copyAccount(updatedAccount)
            : null
          : state.currentStaff,
    });
  }

  /*
   * Authenticate a demo staff account.
   * Cashiers may log in without an assigned theater.
   */
  function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);

    // Find the account using its normalised email.
    const account = state.accounts.find(
      (item) => item.email === normalizedEmail,
    );

    // Reject unknown, inactive, or incorrectly authenticated accounts.
    if (
      !account ||
      !account.active ||
      passwords.get(account.id) !== password
    ) {
      return {
        error:
          "Unable to sign in. Check your credentials or " +
          "contact the company owner.",
      };
    }

    // Save the signed-in staff account.
    publish({
      ...state,
      currentStaff: copyAccount(account),
    });

    return {
      account: copyAccount(account),
    };
  }

  // Clear the current staff session.
  function logout() {
    publish({
      ...state,
      currentStaff: null,
    });
  }

  /*
   * Create a new cashier account.
   * Only the owner can create cashiers.
   * Theater assignment is handled separately.
   */
  function createCashier({
    firstName,
    lastName,
    email,
    password,
  }) {
    // Require the company owner to be signed in.
    if (!ownerIsSignedIn()) {
      return ownerRequiredError();
    }

    const cleanedFirstName = cleanName(firstName);
    const cleanedLastName = cleanName(lastName);
    const normalizedEmail = normalizeEmail(email);

    // Validate the cashier's first name.
    if (
      !cleanedFirstName ||
      cleanedFirstName.length > 100
    ) {
      return {
        error:
          "Enter a first name between 1 and 100 characters.",
      };
    }

    // Validate the cashier's last name.
    if (
      !cleanedLastName ||
      cleanedLastName.length > 100
    ) {
      return {
        error:
          "Enter a last name between 1 and 100 characters.",
      };
    }

    // Validate the email address and maximum length.
    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return {
        error: "Enter a valid email address.",
      };
    }

    // Check password length without changing the password.
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return {
        error:
          "Use a temporary demo password between 8 and 128 characters.",
      };
    }

    // Prevent duplicate staff email addresses.
    if (
      state.accounts.some(
        (account) => account.email === normalizedEmail,
      )
    ) {
      return {
        error:
          "A staff account already uses this email address.",
      };
    }

    // Create an active cashier without a theater assignment.
    const account = withDisplayName({
      id: globalThis.crypto.randomUUID(),
      firstName: cleanedFirstName,
      lastName: cleanedLastName,
      email: normalizedEmail,
      role: "cashier",
      active: true,
      theaterId: null,
      createdAt: Date.now(),
    });

    // Store the demo password separately from the account.
    passwords.set(account.id, password);

    // Add the new cashier to the shared store.
    publish({
      ...state,
      accounts: [...state.accounts, account],
    });

    return {
      account: copyAccount(account),
    };
  }

  /*
   * Activate or deactivate a cashier.
   * Only the owner can change cashier account status.
   */
  function setCashierActive(accountId, active) {
    if (!ownerIsSignedIn()) {
      return ownerRequiredError();
    }

    // Find the cashier account.
    const account = state.accounts.find(
      (item) => item.id === accountId,
    );

    // Owner accounts cannot be changed through this function.
    if (!account || account.role !== "cashier") {
      return {
        error: "Cashier account not found.",
      };
    }

    // Account status must be true or false.
    if (typeof active !== "boolean") {
      return {
        error: "Choose a valid account status.",
      };
    }

    // Preserve account details and theater assignment.
    const updatedAccount = {
      ...account,
      active,
      updatedAt: Date.now(),
    };

    // Update the account and any active session.
    replaceAccount(updatedAccount);

    return {
      account: copyAccount(updatedAccount),
    };
  }

  /*
   * Assign one theater to a cashier.
   * A new assignment replaces the previous theater.
   * null removes the assignment in demo mode.
   */
  function setCashierTheater(accountId, theaterId) {
    if (!ownerIsSignedIn()) {
      return ownerRequiredError();
    }

    // Find the cashier account.
    const account = state.accounts.find(
      (item) => item.id === accountId,
    );

    if (!account || account.role !== "cashier") {
      return {
        error: "Cashier account not found.",
      };
    }

    // Accept null or a theater ID from the allowed list.
    if (
      theaterId !== null &&
      (
        typeof theaterId !== "string" ||
        !knownTheaterIds.has(theaterId)
      )
    ) {
      return {
        error: "Choose a valid theater.",
      };
    }

    // Replace the cashier's current theater assignment.
    const updatedAccount = withDisplayName({
      ...account,
      theaterId,
      updatedAt: Date.now(),
    });

    replaceAccount(updatedAccount);

    return {
      account: copyAccount(updatedAccount),
    };
  }

  /*
   * Support older components using theaterIds arrays.
   * Only zero or one theater is allowed.
   */
  function setCashierTheaters(accountId, theaterIds) {
    if (!ownerIsSignedIn()) {
      return ownerRequiredError();
    }

    // Reject invalid arrays and multiple assignments.
    if (
      !Array.isArray(theaterIds) ||
      theaterIds.length > 1
    ) {
      return {
        error:
          "A cashier can be assigned to only one theater at a time.",
      };
    }

    // Convert the array to the single-theater assignment format.
    return setCashierTheater(
      accountId,
      theaterIds.length ? theaterIds[0] : null,
    );
  }

  // Expose the store's state, subscriptions, and staff actions.
  return {
    getSnapshot: () => state,

    // Allow React components to subscribe to store changes.
    subscribe(listener) {
      listeners.add(listener);

      // Remove the listener when the component unsubscribes.
      return () => {
        listeners.delete(listener);
      };
    },

    login,
    logout,
    createCashier,
    setCashierActive,
    setCashierTheater,
    setCashierTheaters,
  };
}