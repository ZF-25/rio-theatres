/*
 * FILE: frontend/src/services/demoAuth.js
 *
 * Provides customer registration, login, and logout in demo mode.
 * Accounts are stored in memory and reset when the browser refreshes.
 *
 * Also coordinates session changes with the demo booking service.
 * Active booking holds may transfer, but completed bookings must not.
 */

import { ApiError } from "./apiClient.js";

/*
 * Creates a demo authentication service.
 * makeId and now can be replaced with test values.
 */
export function createDemoAuth({
  makeId = () => globalThis.crypto.randomUUID(),
  now = () => Date.now(),
} = {}) {
  // Store customer profiles and passwords separately.
  // Real applications must hash passwords on the backend.
  const accounts = new Map();
  const passwords = new Map();

  // Track the current user and temporary session identifiers.
  let currentUser = null;
  let sessionId = `demo-session-${makeId()}`;
  let csrfToken = `demo-csrf-${makeId()}`;

  // Connect booking changes and prevent overlapping transitions.
  let sessionParticipant = null;
  let transitioning = false;

  // Stop the operation if its AbortSignal has been cancelled.
  function checkSignal(signal) {
    signal?.throwIfAborted();
  }

  // Remove surrounding spaces from a name.
  function cleanName(value) {
    return typeof value === "string"
      ? value.trim()
      : "";
  }

  // Standardise email addresses before storing or comparing them.
  function normaliseEmail(value) {
    return typeof value === "string"
      ? value.trim().toLowerCase()
      : "";
  }

  /*
   * Returns the current user and CSRF token.
   * Matches the response format used by apiAuth.js.
   */
  function sessionResponse() {
    return {
      data: {
        user: currentUser ? { ...currentUser } : null,
        csrfToken,
      },
    };
  }

  /*
   * Returns the internal session identity for demo services.
   * The user profile is copied to avoid exposing the original object.
   */
  function getDemoSession() {
    return {
      sessionId,
      user: currentUser ? { ...currentUser } : null,
    };
  }

  // Customers must sign out before registering another account.
  function requireAnonymousRegistration() {
    if (currentUser) {
      throw new ApiError(
        "Sign out before creating another account.",
        {
          status: 409,
          code: "ALREADY_AUTHENTICATED",
        },
      );
    }
  }

  /*
   * Changes the authentication session.
   * Coordinates booking updates and restores old state if something fails.
   *
   * action: "register", "login", or "logout"
   * nextUser: the next signed-in user, or null
   * registration: optional new account and password
   */
  function transition(
    action,
    nextUser,
    registration = null,
  ) {
    // Prevent two session changes from happening at the same time.
    if (transitioning) {
      throw new ApiError(
        "Please wait for the current authentication action.",
        { code: "AUTH_BUSY" },
      );
    }

    transitioning = true;

    // Save the old session in case the transition must be reversed.
    const previousUser = currentUser;
    const previousSessionId = sessionId;
    const previousCsrfToken = csrfToken;

    let plan = null;
    let addedAccount = false;

    try {
      // Generate new identifiers for the next session.
      const nextSessionId = `demo-session-${makeId()}`;
      const nextCsrfToken = `demo-csrf-${makeId()}`;

      /*
       * Ask the booking service to prepare its changes.
       * Preparation must not modify data or include passwords.
       */
      plan =
        sessionParticipant?.prepareTransition({
          action,
          previous: getDemoSession(),
          next: {
            sessionId: nextSessionId,
            user: nextUser ? { ...nextUser } : null,
          },
        }) ?? null;

      // A booking transition plan must support commit and rollback.
      if (
        plan &&
        (
          typeof plan.commit !== "function" ||
          typeof plan.rollback !== "function"
        )
      ) {
        throw new Error(
          "Invalid demo session transition plan.",
        );
      }

      // Save the new account and password during registration.
      if (registration) {
        accounts.set(
          registration.account.email,
          registration.account,
        );

        passwords.set(
          registration.account.id,
          registration.password,
        );

        addedAccount = true;
      }

      // Apply the new authentication state.
      currentUser = nextUser ? { ...nextUser } : null;
      sessionId = nextSessionId;
      csrfToken = nextCsrfToken;

      // Commit prepared booking changes synchronously.
      // No asynchronous operation interleaves this commit.
      plan?.commit();

      return sessionResponse();
    } catch (error) {
      // Undo booking changes and restore the previous session.
      try {
        if (plan && typeof plan.rollback === "function") {
          plan.rollback();
        }
      } finally {
        currentUser = previousUser;
        sessionId = previousSessionId;
        csrfToken = previousCsrfToken;

        // Remove a newly created account if registration failed.
        if (addedAccount) {
          accounts.delete(registration.account.email);
          passwords.delete(registration.account.id);
        }
      }

      throw error;
    } finally {
      // Always release the transition lock.
      transitioning = false;
    }
  }

  // Expose the demo authentication methods.
  return {
    getDemoSession,

    /*
     * Connects one shared booking service to session changes.
     * The participant must provide prepareTransition().
     */
    registerSessionParticipant(participant) {
      if (
        typeof participant?.prepareTransition !== "function"
      ) {
        throw new Error(
          "A demo session participant must prepare transitions.",
        );
      }

      // Prevent different booking services from sharing this auth instance.
      if (
        sessionParticipant &&
        sessionParticipant !== participant
      ) {
        throw new Error(
          "Use one shared demo booking service per auth service.",
        );
      }

      sessionParticipant = participant;

      // Return a function that disconnects this participant.
      return () => {
        if (sessionParticipant === participant) {
          sessionParticipant = null;
        }
      };
    },

    /*
     * Returns the current session without contacting a backend.
     * Supports optional request cancellation.
     */
    async getSession({ signal } = {}) {
      checkSignal(signal);

      return sessionResponse();
    },

    /*
     * Validates registration details, creates a customer account,
     * and signs the customer in.
     */
    async register(
      { firstName, lastName, email, password },
      { signal } = {},
    ) {
      checkSignal(signal);
      requireAnonymousRegistration();

      // Prepare names and email; passwords are never trimmed.
      const cleanedFirstName = cleanName(firstName);
      const cleanedLastName = cleanName(lastName);
      const normalisedEmail = normaliseEmail(email);
      const fieldErrors = {};

      // First name must contain 1–100 characters.
      if (
        !cleanedFirstName ||
        cleanedFirstName.length > 100
      ) {
        fieldErrors.firstName =
          "Enter a first name between 1 and 100 characters.";
      }

      // Last name must contain 1–100 characters.
      if (
        !cleanedLastName ||
        cleanedLastName.length > 100
      ) {
        fieldErrors.lastName =
          "Enter a last name between 1 and 100 characters.";
      }

      // Check the email length and basic format.
      if (
        normalisedEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)
      ) {
        fieldErrors.email =
          "Enter a valid email address.";
      }

      // Passwords must contain 8–128 characters.
      // Never trim passwords.
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      ) {
        fieldErrors.password =
          "Use a password between 8 and 128 characters.";
      }

      // Return field-specific errors if validation fails.
      if (Object.keys(fieldErrors).length) {
        throw new ApiError(
          "Please check the highlighted fields.",
          {
            status: 422,
            code: "VALIDATION_ERROR",
            fieldErrors,
          },
        );
      }

      // Prevent customers from registering the same email twice.
      if (accounts.has(normalisedEmail)) {
        throw new ApiError(
          "An account already uses this email address.",
          {
            status: 409,
            code: "EMAIL_IN_USE",
            fieldErrors: {
              email:
                "An account already uses this email address.",
            },
          },
        );
      }

      // Create the customer profile without including the password.
      const account = {
        id: `demo-customer-${makeId()}`,
        firstName: cleanedFirstName,
        lastName: cleanedLastName,
        email: normalisedEmail,
        role: "customer",
        active: true,
        createdAt: new Date(now()).toISOString(),
      };

      // Save the account, start its session, and coordinate bookings.
      return transition(
        "register",
        account,
        { account, password },
      );
    },

    /*
     * Checks the customer's email and password.
     * Invalid credentials do not change the session.
     */
    async login(
      { email, password },
      { signal } = {},
    ) {
      checkSignal(signal);

      // Find the account using its normalised email.
      const account = accounts.get(
        normaliseEmail(email),
      );

      // Reject missing accounts or incorrect passwords.
      if (
        !account ||
        typeof password !== "string" ||
        passwords.get(account.id) !== password
      ) {
        throw new ApiError(
          "Unable to sign in. Check your email and password.",
          {
            status: 401,
            code: "INVALID_CREDENTIALS",
          },
        );
      }

      // Sign in and coordinate any booking ownership changes.
      return transition("login", account);
    },

    /*
     * Signs out the customer and creates an anonymous session.
     * Registered demo accounts remain available until refresh.
     */
    async logout({ signal } = {}) {
      checkSignal(signal);

      // The booking participant handles any active-hold cleanup.
      transition("logout", null);

      return null;
    },
  };
}