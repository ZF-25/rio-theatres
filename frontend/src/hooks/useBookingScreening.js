/*
 * FILE: frontend/src/hooks/useBookingScreening.js
 *
 * PURPOSE
 * -------
 * Loads a screening and its seat map with background refresh.
 *
 * DEFAULT USE
 * -----------
 * Customer Seat Selection and Checkout:
 *
 * useBookingScreening(screeningId)
 *
 * CUSTOM SOURCE
 * -------------
 * The upcoming staff hook supplies staffScreenings instead:
 *
 * useBookingScreening(screeningId, {
 *   service: staffScreenings,
 *   sourceEnabled: staffEnabled,
 *   enabled: hasStaffAccess,
 * })
 *
 * IMPORTANT
 * ---------
 * Pass a stable service object imported from a module.
 * Do not create a new service object during every render.
 *
 * This hook only reads data.
 * Hold/reservation mutations must validate availability again.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  booking,
  bookingEnabled,
} from "../services/booking.js";

import {
  ApiError,
} from "../services/apiClient.js";


const REFRESH_INTERVAL_MS = 10_000;


/*
 * Tag results with BOTH screening ID and service identity.
 *
 * Different sources could use the same screening ID.
 * Their results must not be mixed.
 */
const INITIAL_STATE = {
  service: null,
  screeningId: null,
  data: null,
  error: null,
  pending: false,
  updatedAt: null,
  serverOffsetMs: 0,
};


export function useBookingScreening(
  screeningId,
  {
    enabled = true,
    service = booking,
    sourceEnabled = bookingEnabled,
  } = {},
) {
  const [state, setState] = useState(
    INITIAL_STATE,
  );

  const refreshAction = useRef(null);

  const shouldLoad = Boolean(
    enabled &&
    sourceEnabled &&
    typeof screeningId === "string" &&
    screeningId !== "",
  );


  /*
   * STABLE PUBLIC REFRESH ACTION
   *
   * The active effect supplies its current implementation.
   * This never creates or extends a hold/reservation.
   */
  const refresh = useCallback(() => {
    refreshAction.current?.();
  }, []);


  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    let active = true;
    let inFlight = false;
    let refreshQueued = false;

    let timerId = null;
    let controller = null;


    /*
     * Schedule after completion instead of using a fixed interval.
     * Slow requests therefore do not repeatedly overlap.
     */
    function scheduleNext() {
      window.clearTimeout(timerId);

      if (active) {
        timerId = window.setTimeout(
          requestRefresh,
          REFRESH_INTERVAL_MS,
        );
      }
    }


    /*
     * CHECK WHETHER PREVIOUS DATA BELONGS TO THIS REQUEST SOURCE
     */
    function matchesSource(previous) {
      return (
        previous.service === service &&
        previous.screeningId === screeningId
      );
    }


    /*
     * LOAD SCREENING AND MAP TOGETHER
     */
    async function load() {
      if (!active) {
        return;
      }

      if (
        document.visibilityState === "hidden"
      ) {
        scheduleNext();
        return;
      }

      if (inFlight) {
        refreshQueued = true;
        return;
      }

      inFlight = true;
      controller = new AbortController();

      const requestController = controller;

      /*
       * Retain a matching map during background refresh.
       * Never retain another source/screening's map.
       */
      setState((previous) => ({
        service,
        screeningId,

        data:
          matchesSource(previous)
            ? previous.data
            : null,

        error: null,
        pending: true,

        updatedAt:
          matchesSource(previous)
            ? previous.updatedAt
            : null,

        serverOffsetMs:
          matchesSource(previous)
            ? previous.serverOffsetMs
            : 0,
      }));

      try {
        const [
          screeningResponse,
          mapResponse,
        ] = await Promise.all([
          service.getScreening(
            screeningId,
            {
              signal:
                requestController.signal,
            },
          ),

          service.getSeatMap(
            screeningId,
            {
              signal:
                requestController.signal,
            },
          ),
        ]);

        if (
          !active ||
          requestController.signal.aborted
        ) {
          return;
        }

        const screening =
          screeningResponse.data;

        const seatMap =
          mapResponse.data;

        const serverTimestamp = Date.parse(
          seatMap?.serverNow,
        );

        /*
         * Validate the minimum fields used by this hook.
         */
        if (
          screening?.id !== screeningId ||
          seatMap?.screeningId !== screeningId ||
          !Array.isArray(seatMap?.seats) ||
          !Number.isFinite(serverTimestamp) ||
          !Number.isFinite(
            Date.parse(screening?.startsAt),
          ) ||
          !["scheduled", "cancelled"].includes(
            screening?.status,
          )
        ) {
          throw new ApiError(
            "The service returned invalid screening or seat information.",
            {
              code: "INVALID_RESPONSE",
            },
          );
        }

        /*
         * Read the clock after the request, not during rendering.
         */
        const receivedAt = Date.now();

        const serverOffsetMs =
          serverTimestamp - receivedAt;

        setState({
          service,
          screeningId,

          data: {
            screening,
            seatMap,
          },

          error: null,
          pending: false,
          updatedAt: receivedAt,
          serverOffsetMs,
        });
      } catch (error) {
        if (
          !active ||
          requestController.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        /*
         * If one parallel read fails, stop any sibling read
         * that may still be running.
         */
        requestController.abort();

        const requestError =
          error instanceof Error
            ? error
            : new Error(
                "Unable to load seat availability.",
              );

        /*
         * Keep the previous matching map visible, but expose
         * the error so continuation can be disabled.
         */
        setState((previous) => ({
          service,
          screeningId,

          data:
            matchesSource(previous)
              ? previous.data
              : null,

          error: requestError,
          pending: false,

          updatedAt:
            matchesSource(previous)
              ? previous.updatedAt
              : null,

          serverOffsetMs:
            matchesSource(previous)
              ? previous.serverOffsetMs
              : 0,
        }));
      } finally {
        inFlight = false;
        controller = null;

        if (active) {
          if (
            refreshQueued &&
            document.visibilityState !== "hidden"
          ) {
            refreshQueued = false;
            requestRefresh();
          } else {
            refreshQueued = false;
            scheduleNext();
          }
        }
      }
    }


    /*
     * SHARED REFRESH HANDLER
     *
     * Multiple events during a request queue at most one
     * immediate follow-up request.
     */
    function requestRefresh() {
      if (!active) {
        return;
      }

      window.clearTimeout(timerId);

      if (inFlight) {
        refreshQueued = true;
        return;
      }

      void load();
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState !== "hidden"
      ) {
        requestRefresh();
      }
    }


    /*
     * LOCAL STORE / BROWSER SUBSCRIPTIONS
     *
     * API services supply an inactive subscription.
     * Polling and focus refreshes still operate.
     */
    const unsubscribe =
      service.subscribe(requestRefresh);

    window.addEventListener(
      "focus",
      requestRefresh,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    refreshAction.current =
      requestRefresh;


    /*
     * INITIAL REQUEST
     *
     * Skip an obsolete StrictMode setup after cleanup.
     */
    Promise.resolve().then(() => {
      if (active) {
        requestRefresh();
      }
    });


    /*
     * CLEANUP
     */
    return () => {
      active = false;

      window.clearTimeout(timerId);
      controller?.abort();
      unsubscribe();

      window.removeEventListener(
        "focus",
        requestRefresh,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      if (
        refreshAction.current === requestRefresh
      ) {
        refreshAction.current = null;
      }
    };
  }, [
    screeningId,
    shouldLoad,
    service,
  ]);


  /*
   * EXPOSE ONLY THE CURRENT SOURCE'S RESULTS
   */
  const current =
    shouldLoad &&
    state.service === service &&
    state.screeningId === screeningId
      ? state
      : INITIAL_STATE;

  const screening =
    current.data?.screening ?? null;

  const seatMap =
    current.data?.seatMap ?? null;


  /*
   * SERVER TIME AT THE LATEST SUCCESSFUL CHECK
   *
   * Stored timestamps keep rendering pure.
   * No Date.now() call occurs here.
   */
  const estimatedServerNow =
    current.updatedAt === null
      ? null
      : current.updatedAt +
        current.serverOffsetMs;

  const hasUsableAvailability = Boolean(
    shouldLoad &&
    current.data &&
    !current.error,
  );

  const isBookable = Boolean(
    hasUsableAvailability &&
    estimatedServerNow !== null &&
    screening?.status === "scheduled" &&
    Date.parse(screening.startsAt) >
      estimatedServerNow,
  );


  return {
    screening,
    seatMap,

    loading: Boolean(
      shouldLoad &&
      !current.data &&
      !current.error,
    ),

    refreshing: Boolean(
      current.data &&
      current.pending,
    ),

    error: current.error,

    updatedAt: current.updatedAt,
    serverOffsetMs: current.serverOffsetMs,

    hasUsableAvailability,
    isBookable,

    refresh,
    retry: refresh,
  };
}