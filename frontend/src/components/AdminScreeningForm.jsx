/*
 * FILE: frontend/src/components/AdminScreeningForm.jsx
 *
 * PURPOSE
 * -------
 * Creates or edits a screening through the owner service.
 *
 * DATA SOURCES
 * ------------
 * ownerService.listMovies():
 * All locally imported movies, including unscheduled movies.
 *
 * catalogue.listCinemas():
 * Cinema options.
 *
 * catalogue.listRooms():
 * Rooms belonging to the selected cinema.
 *
 * MUTATIONS
 * ---------
 * ownerService.createScreening()
 * ownerService.updateScreening()
 *
 * TIME HANDLING
 * -------------
 * The owner enters Helsinki date/time.
 * screeningTime.js converts it into an explicit UTC instant.
 *
 * IMPORTANT
 * ---------
 * Room ownership, overlaps, protected bookings/holds, and owner
 * permissions must also be checked by the backend.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ownerService,
  staffEnabled,
  staffMode,
} from "../services/staff.js";

import {
  catalogue,
} from "../services/catalogue.js";

import {
  collectPages,
} from "../services/apiCatalogue.js";

import {
  useStaffSession,
} from "../hooks/useStaffSession.js";

import {
  useResource,
} from "../hooks/useResource.js";

import {
  cinemaDate,
} from "../utils/cinemaTime.js";

import {
  getHelsinkiTimeOptions,
  helsinkiInputToUtc,
  utcToHelsinkiInput,
} from "../utils/screeningTime.js";

import RequestState from "./RequestState.jsx";


/*
 * Safely prepare an existing screening's local form values.
 * An unsupported timestamp becomes a visible form error.
 */
function initialTiming(screening) {
  if (!screening) {
    return {
      date: "",
      time: "",
      offset: "",
      error: "",
    };
  }

  try {
    const value =
      utcToHelsinkiInput(
        screening.startsAt,
      );

    return {
      date: value.date,
      time: value.time,
      offset: String(
        value.utcOffsetMinutes,
      ),
      error: "",
    };
  } catch (error) {
    return {
      date: "",
      time: "",
      offset: "",
      error: error.message,
    };
  }
}


/*
 * Reset local state when switching between screening records.
 *
 * Props:
 * screening:
 * Existing service-format Screening, or null for creation.
 *
 * onSaved(screening):
 * Parent refreshes its list and closes the editor.
 *
 * onCancel():
 * Parent closes the editor without submitting.
 */
function AdminScreeningForm({
  screening = null,
  onSaved,
  onCancel,
}) {
  return (
    <ScreeningFormContent
      key={screening?.id ?? "new-screening"}
      screening={screening}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}


function ScreeningFormContent({
  screening,
  onSaved,
  onCancel,
}) {
  const {
    staff,
    isOwner,
    status,
    sessionError,
    isSessionLoading,
    refreshSession,
  } = useStaffSession();

  const [timing] = useState(
    () => initialTiming(screening),
  );

  const [today] = useState(
    () => cinemaDate(),
  );

  const [form, setForm] = useState({
    movieId: screening?.movieId ?? "",
    cinemaId: screening?.cinemaId ?? "",
    roomId: screening?.roomId ?? "",

    date: timing.date,
    time: timing.time,
    offset: timing.offset,

    spokenLanguage:
      screening?.spokenLanguage ?? "",

    subtitles:
      screening?.subtitles?.join(", ") ?? "",
  });

  const [error, setError] =
    useState(timing.error);

  const [fieldErrors, setFieldErrors] =
    useState({});

  const [saving, setSaving] =
    useState(false);

  /*
   * If saving succeeded but the parent callback failed, retain
   * the result so another click does not create another screening.
   */
  const [savedRecord, setSavedRecord] =
    useState(null);

  const submissionInProgress =
    useRef(false);

  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true,
    });
  }, []);


  /*
   * LOAD MOVIES AND CINEMAS
   *
   * These are small selector lists, so collect every page.
   */
  const loadReferences = useCallback(
    async (signal) => {
      if (
        !staffEnabled ||
        isSessionLoading ||
        status === "error" ||
        staff?.role !== "owner"
      ) {
        return null;
      }

      const [
        movies,
        cinemas,
      ] = await Promise.all([
        collectPages(
          ownerService.listMovies,
          { signal },
        ),

        collectPages(
          catalogue.listCinemas,
          { signal },
        ),
      ]);

      return {
        movies,
        cinemas,
      };
    },
    [
      staff,
      status,
      isSessionLoading,
    ],
  );

  const referencesResult =
    useResource(loadReferences);

  const movies =
    referencesResult.data?.movies ?? [];

  const cinemas =
    referencesResult.data?.cinemas ?? [];

  const cinema =
    cinemas.find(
      (item) => item.id === form.cinemaId,
    ) ?? cinemas[0];

  const movie =
    movies.find(
      (item) => item.id === form.movieId,
    );


  /*
   * LOAD THE SELECTED CINEMA'S ROOMS
   */
  const loadRooms = useCallback(
    (signal) => {
      if (!cinema) {
        return Promise.resolve([]);
      }

      return collectPages(
        (query, options) => {
          return catalogue.listRooms(
            cinema.id,
            query,
            options,
          );
        },
        { signal },
      );
    },
    [cinema],
  );

  const roomsResult =
    useResource(loadRooms);

  const rooms =
    roomsResult.data ?? [];

  const room =
    rooms.find(
      (item) => item.id === form.roomId,
    );


  /*
   * TIME OPTIONS
   *
   * Pure calculation from the current form values.
   * No current-clock reads occur during rendering.
   */
  let timeOptions = [];
  let timeError = "";

  if (form.date && form.time) {
    try {
      timeOptions =
        getHelsinkiTimeOptions(
          form.date,
          form.time,
        );

      if (timeOptions.length === 0) {
        timeError =
          "This local time does not exist because the clocks move forward.";
      }
    } catch (requestError) {
      timeError =
        requestError.message;
    }
  }

  const ambiguousTime =
    timeOptions.length > 1;

  const cancelled =
    screening?.status === "cancelled";

  const fieldsLocked =
    saving ||
    savedRecord !== null ||
    cancelled;

  const referencesLoading =
    referencesResult.loading ||
    Boolean(
      cinema && roomsResult.loading,
    );

  const referencesError =
    referencesResult.error ||
    roomsResult.error;


  function changeField(field, value) {
    if (fieldsLocked) {
      return;
    }

    setError("");

    setFieldErrors((previous) => ({
      ...previous,
      [field]: "",
      startsAt: "",
    }));

    setForm((previous) => ({
      ...previous,
      [field]: value,

      /*
       * A new date/time requires a fresh ambiguity choice.
       */
      ...(
        field === "date" ||
        field === "time"
          ? { offset: "" }
          : {}
      ),

      /*
       * A room from the previous cinema cannot remain selected.
       */
      ...(
        field === "cinemaId"
          ? { roomId: "" }
          : {}
      ),
    }));
  }

  function retryReferences() {
    referencesResult.retry();
    roomsResult.retry();
  }


  /*
   * VALIDATE AND SAVE
   *
   * The service/backend remains authoritative.
   * Local checks provide immediate form feedback.
   */
  async function handleSubmit(event) {
    event.preventDefault();

    if (
      submissionInProgress.current ||
      !isOwner ||
      !staffEnabled ||
      cancelled
    ) {
      return;
    }

    setError("");
    setFieldErrors({});

    if (
      typeof onSaved !== "function"
    ) {
      setError(
        "The screening list is currently unavailable.",
      );
      return;
    }

    /*
     * A prior save succeeded, but navigation failed.
     * Retry only the parent callback.
     */
    if (savedRecord) {
      submissionInProgress.current = true;
      setSaving(true);

      try {
        await onSaved(savedRecord);
      } catch (requestError) {
        setError(
          requestError.message ||
            "The screening was saved, but the list could not be opened.",
        );
      } finally {
        submissionInProgress.current = false;
        setSaving(false);
      }

      return;
    }

    const errors = {};

    if (!movie) {
      errors.movieId =
        "Choose a movie.";
    } else if (
      !Number.isInteger(
        movie.durationMinutes,
      ) ||
      movie.durationMinutes <= 0
    ) {
      errors.movieId =
        "This movie needs a valid runtime before scheduling.";
    }

    if (!room) {
      errors.roomId =
        "Choose a room in the selected cinema.";
    }

    let startsAt;

    try {
      if (
        staffMode === "demo" &&
        ambiguousTime
      ) {
        throw new Error(
          "The existing demo model cannot store repeated local times. Choose an unambiguous time.",
        );
      }

      startsAt =
        helsinkiInputToUtc(
          form.date,
          form.time,

          form.offset === ""
            ? undefined
            : Number(form.offset),
        );

      /*
       * Read the clock during submission, not rendering.
       * The backend must perform its own future-time check.
       */
      if (
        Date.parse(startsAt) <= Date.now()
      ) {
        throw new Error(
          "Choose a future screening time.",
        );
      }
    } catch (requestError) {
      errors.startsAt =
        requestError.message;
    }

    if (
      Object.keys(errors).length > 0
    ) {
      setFieldErrors(errors);

      setError(
        "Please check the highlighted fields.",
      );

      return;
    }

    const draft = {
      movieId: movie.id,
      roomId: room.id,
      startsAt,

      spokenLanguage:
        form.spokenLanguage.trim() ||
        null,

      subtitles: [
        ...new Set(
          form.subtitles
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ],
    };

    submissionInProgress.current = true;
    setSaving(true);

    let completed = null;

    try {
      const response = screening
        ? await ownerService.updateScreening(
            screening.id,
            draft,
          )
        : await ownerService.createScreening(
            draft,
          );

      completed = response.data;

      setSavedRecord(completed);

      await onSaved(completed);
    } catch (requestError) {
      if (completed) {
        setError(
          "The screening was saved. Use Return to screenings to open the list.",
        );
      } else {
        setError(
          requestError.message ||
            "Unable to save this screening.",
        );

        setFieldErrors(
          requestError.fieldErrors ?? {},
        );
      }
    } finally {
      submissionInProgress.current = false;
      setSaving(false);
    }
  }


  /*
   * ACCESS / SESSION FEEDBACK
   */
  if (
    !staffEnabled ||
    isSessionLoading ||
    status === "error" ||
    !isOwner
  ) {
    return (
      <section>
        <h2
          ref={headingRef}
          tabIndex={-1}
        >
          Screening editor
        </h2>

        {isSessionLoading ? (
          <RequestState
            loading
            loadingMessage="Checking owner access…"
          />
        ) : status === "error" ? (
          <RequestState
            error={sessionError}
            onRetry={() => {
              refreshSession();
            }}
          />
        ) : (
          <p>
            An active owner account and matching staff
            catalogue are required.
          </p>
        )}
      </section>
    );
  }


  return (
    <section
      aria-labelledby="screening-editor-title"
    >
      <h2
        id="screening-editor-title"
        ref={headingRef}
        tabIndex={-1}
      >
        {screening
          ? "Edit screening"
          : "Add screening"}
      </h2>

      <RequestState
        loading={referencesLoading}
        error={referencesError}
        onRetry={retryReferences}
        loadingMessage="Loading movies and rooms…"
      />

      {cancelled && (
        <p
          className="admin-edit-error"
          role="alert"
        >
          Cancelled screenings cannot be edited.
        </p>
      )}

      <div className="admin-screening-editor-layout">
        <form
          className="admin-screening-form"
          onSubmit={handleSubmit}
          aria-busy={saving}
          noValidate
        >
          {error && (
            <p
              className="admin-edit-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <label htmlFor="screening-movie">
            <span>Movie</span>

            <select
              id="screening-movie"
              value={form.movieId}
              disabled={
                fieldsLocked ||
                referencesResult.loading ||
                Boolean(
                  referencesResult.error,
                )
              }
              onChange={(event) => {
                changeField(
                  "movieId",
                  event.target.value,
                );
              }}
              aria-invalid={
                fieldErrors.movieId
                  ? true
                  : undefined
              }
              aria-describedby={
                fieldErrors.movieId
                  ? "screening-movie-error"
                  : undefined
              }
            >
              <option value="">
                Select movie
              </option>

              {movies.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.title}
                </option>
              ))}
            </select>

            {fieldErrors.movieId && (
              <span
                id="screening-movie-error"
                className="admin-edit-error"
              >
                {fieldErrors.movieId}
              </span>
            )}
          </label>

          <label htmlFor="screening-cinema">
            <span>Cinema</span>

            <select
              id="screening-cinema"
              value={cinema?.id ?? ""}
              disabled={
                fieldsLocked ||
                referencesResult.loading ||
                cinemas.length === 0
              }
              onChange={(event) => {
                changeField(
                  "cinemaId",
                  event.target.value,
                );
              }}
            >
              {!cinemas.length && (
                <option value="">
                  No cinemas
                </option>
              )}

              {cinemas.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="screening-room">
            <span>Room</span>

            <select
              id="screening-room"
              value={room?.id ?? ""}
              disabled={
                fieldsLocked ||
                referencesLoading ||
                Boolean(referencesError)
              }
              onChange={(event) => {
                changeField(
                  "roomId",
                  event.target.value,
                );
              }}
              aria-invalid={
                fieldErrors.roomId
                  ? true
                  : undefined
              }
              aria-describedby={
                fieldErrors.roomId
                  ? "screening-room-error"
                  : undefined
              }
            >
              <option value="">
                Select room
              </option>

              {rooms.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name}
                  {" · "}
                  {item.capacity} seats
                </option>
              ))}
            </select>

            {fieldErrors.roomId && (
              <span
                id="screening-room-error"
                className="admin-edit-error"
              >
                {fieldErrors.roomId}
              </span>
            )}
          </label>

          <label htmlFor="screening-date">
            <span>Date in Finland</span>

            <input
              id="screening-date"
              type="date"
              value={form.date}
              min={today}
              disabled={fieldsLocked}
              onChange={(event) => {
                changeField(
                  "date",
                  event.target.value,
                );
              }}
              aria-invalid={
                fieldErrors.startsAt
                  ? true
                  : undefined
              }
              aria-describedby={
                fieldErrors.startsAt
                  ? "screening-time-error"
                  : undefined
              }
            />
          </label>

          <label htmlFor="screening-time">
            <span>Start time in Finland</span>

            <input
              id="screening-time"
              type="time"
              step={60}
              value={form.time}
              disabled={fieldsLocked}
              onChange={(event) => {
                changeField(
                  "time",
                  event.target.value,
                );
              }}
              aria-invalid={
                fieldErrors.startsAt
                  ? true
                  : undefined
              }
              aria-describedby={
                fieldErrors.startsAt
                  ? "screening-time-error"
                  : undefined
              }
            />
          </label>

          {(fieldErrors.startsAt || timeError) && (
            <p
              id="screening-time-error"
              className="admin-edit-error"
            >
              {fieldErrors.startsAt || timeError}
            </p>
          )}

          {ambiguousTime &&
            staffMode === "api" && (
              <label htmlFor="screening-offset">
                <span>
                  Which occurrence of this time?
                </span>

                <select
                  id="screening-offset"
                  value={form.offset}
                  disabled={fieldsLocked}
                  onChange={(event) => {
                    changeField(
                      "offset",
                      event.target.value,
                    );
                  }}
                >
                  <option value="">
                    Select occurrence
                  </option>

                  {timeOptions.map((option) => (
                    <option
                      key={option.startsAt}
                      value={
                        option.utcOffsetMinutes
                      }
                    >
                      {form.time}
                      {" · "}
                      {option.utcOffsetLabel}
                    </option>
                  ))}
                </select>
              </label>
            )}

          <label htmlFor="screening-language">
            <span>Spoken language</span>

            <input
              id="screening-language"
              type="text"
              maxLength={100}
              placeholder="For example, English"
              value={form.spokenLanguage}
              disabled={fieldsLocked}
              onChange={(event) => {
                changeField(
                  "spokenLanguage",
                  event.target.value,
                );
              }}
            />
          </label>

          <label htmlFor="screening-subtitles">
            <span>Subtitles</span>

            <input
              id="screening-subtitles"
              type="text"
              placeholder="For example, Finnish, Swedish"
              value={form.subtitles}
              disabled={fieldsLocked}
              onChange={(event) => {
                changeField(
                  "subtitles",
                  event.target.value,
                );
              }}
            />

            <span>
              Separate languages with commas.
            </span>
          </label>

          <div className="admin-screening-form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={
                saving ||
                cancelled ||
                referencesLoading ||
                Boolean(referencesError) ||
                typeof onSaved !== "function"
              }
            >
              {saving
                ? "Saving…"
                : savedRecord
                  ? "Return to screenings"
                  : screening
                    ? "Save changes"
                    : "Create screening"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
              disabled={
                saving ||
                typeof onCancel !== "function"
              }
            >
              {savedRecord
                ? "Back to screenings"
                : "Cancel"}
            </button>
          </div>
        </form>


        {/* EXPLANATION OF SCHEDULING RULES */}
        <aside className="admin-screening-guidance">
          <h3>
            Scheduling information
          </h3>

          {movie && (
            <p className="admin-runtime">
              {movie.title}
              {" · "}
              {movie.durationMinutes
                ? `${movie.durationMinutes} minutes`
                : "Runtime unavailable"}
            </p>
          )}

          <p>
            Enter times in Finland's timezone.
            The service receives an explicit UTC timestamp.
          </p>

          <p>
            Screenings in the same room cannot overlap.
            Movie runtime is included in that check.
          </p>

          <p>
            Screenings with booking or reservation history,
            or active checkout holds, cannot be edited.
            Cancel the screening when appropriate.
          </p>
        </aside>
      </div>
    </section>
  );
}

export default AdminScreeningForm;