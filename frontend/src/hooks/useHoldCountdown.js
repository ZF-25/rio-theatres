/*
 * FILE: frontend/src/hooks/useHoldCountdown.js
 *
 * PURPOSE
 * -------
 * Displays the remaining time for a checkout hold.
 *
 * USED BY
 * -------
 * The upcoming service-based Checkout page.
 *
 * INPUTS
 * ------
 * expiresAt:
 * ISO timestamp returned by the hold service.
 *
 * serverNow:
 * ISO server timestamp returned with that hold.
 *
 * receivedAt:
 * Local Date.now() captured immediately after receiving the hold.
 * The upcoming Checkout loader will supply this value.
 *
 * enabled:
 * Allows the caller to stop the countdown.
 *
 * IMPORTANT
 * ---------
 * This hook does not create, extend, or release a hold.
 *
 * The backend remains responsible for enforcing expiry.
 * A displayed countdown is only user-interface feedback.
 */

import {
  useEffect,
  useState,
} from "react";


export function useHoldCountdown({
  expiresAt,
  serverNow,
  receivedAt,
  enabled = true,
}) {
  /*
   * Parse service timestamps.
   *
   * Parsing fixed inputs is safe during rendering.
   * Reading the current clock happens inside the effect.
   */
  const expiryTimestamp =
    Date.parse(expiresAt);

  const serverTimestamp =
    Date.parse(serverNow);

  const validInput =
    Number.isFinite(expiryTimestamp) &&
    Number.isFinite(serverTimestamp) &&
    Number.isFinite(receivedAt);

  const shouldRun =
    enabled && validInput;


  /*
   * Identify the exact timing sample.
   *
   * A refreshed hold response may have the same expiry but a
   * newer serverNow/receivedAt pair.
   *
   * Never display a previous sample as if it were current.
   */
  const sampleKey = JSON.stringify([
    expiresAt,
    serverNow,
    receivedAt,
  ]);

  const [sample, setSample] =
    useState(null);


  useEffect(() => {
    if (!shouldRun) {
      return;
    }

    let active = true;

    /*
     * Account for time between receiving the response and
     * starting this effect.
     *
     * The customer's timezone does not matter because these
     * values represent instants, not displayed local times.
     */
    const elapsedBeforeStart = Math.max(
      0,
      Date.now() - receivedAt,
    );

    /*
     * performance.now() measures elapsed time.
     *
     * Using it after this anchor prevents a later change to the
     * computer's wall clock from restarting the visible timer.
     *
     * Network latency and initial clock changes can still affect
     * the estimate; backend expiry checks remain authoritative.
     */
    const monotonicStart =
      performance.now();


    function updateCountdown() {
      if (!active) {
        return;
      }

      const elapsedSinceStart = Math.max(
        0,
        performance.now() - monotonicStart,
      );

      const estimatedServerNow =
        serverTimestamp +
        elapsedBeforeStart +
        elapsedSinceStart;

      const remainingSeconds = Math.max(
        0,
        Math.ceil(
          (
            expiryTimestamp -
            estimatedServerNow
          ) / 1000,
        ),
      );

      setSample((previous) => {
        /*
         * Avoid an unnecessary update if the displayed second
         * has not changed.
         */
        if (
          previous?.key === sampleKey &&
          previous.remainingSeconds ===
            remainingSeconds
        ) {
          return previous;
        }

        return {
          key: sampleKey,
          remainingSeconds,
        };
      });
    }


    /*
     * Initial update is deferred until effect setup finishes.
     * Cleanup prevents an obsolete StrictMode setup from updating.
     */
    Promise.resolve().then(() => {
      updateCountdown();
    });

    const intervalId =
      window.setInterval(
        updateCountdown,
        1000,
      );

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    shouldRun,
    sampleKey,
    expiryTimestamp,
    serverTimestamp,
    receivedAt,
  ]);


  /*
   * RENDER USING STORED STATE
   *
   * No Date.now() or performance.now() calls occur here.
   *
   * Invalid/uninitialised timing must not be treated as a valid,
   * active hold.
   */
  const isReady = Boolean(
    shouldRun &&
    sample?.key === sampleKey,
  );

  const remainingSeconds = isReady
    ? sample.remainingSeconds
    : 0;

  const minutes = String(
    Math.floor(remainingSeconds / 60),
  ).padStart(2, "0");

  const seconds = String(
    remainingSeconds % 60,
  ).padStart(2, "0");


  return {
    isValid: validInput,
    isReady,

    remainingSeconds,

    isExpired:
      isReady && remainingSeconds === 0,

    minutes,
    seconds,

    formatted: `${minutes}:${seconds}`,
  };
}