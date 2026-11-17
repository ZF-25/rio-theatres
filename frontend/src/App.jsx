/*
 * FILE: frontend/src/App.jsx
 *
 * Includes customer catalogue/authentication and staff login.
 * Owner/cashier workspaces are previews in this batch.
 *
 * Route guards control the interface only.
 * Backend authorization remains necessary after integration.
 */

import { useEffect, useState } from "react";

import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import CustomerLayout from "./layouts/CustomerLayout.jsx";

import CatalogueHome from "./pages/CatalogueHome.jsx";
import MovieDetails from "./pages/MovieDetails.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import StaffLogin from "./pages/StaffLogin.jsx";

import RequestState from "./components/RequestState.jsx";

import { useAuth } from "./hooks/useAuth.js";
import { useStaffSession } from "./hooks/useStaffSession.js";
import { getUserDisplayName } from "./utils/userName.js";

import "./App.css";

const homeSections = new Set([
  "home",
  "movies",
  "locations",
  "contact",
  "about",
]);

function FeaturePlaceholder({
  title,
  children,
  onBack,
}) {
  return (
    <section className="container section">
      <h1>{title}</h1>
      <p>{children}</p>

      <button
        type="button"
        className="secondary-button"
        onClick={onBack}
      >
        Back to movies
      </button>
    </section>
  );
}

/*
 * Temporary protected workspace.
 *
 * A cashier cannot open the owner preview, and an anonymous
 * visitor is returned to staff login.
 */
function StaffWorkspace({
  role,
  session,
  onLogout,
}) {
  if (session.isSessionLoading) {
    return (
      <RequestState
        loading
        loadingMessage="Checking staff access…"
      />
    );
  }

  if (session.status === "error") {
    return (
      <RequestState
        error={session.sessionError}
        onRetry={() => session.refreshSession()}
      />
    );
  }

  if (
    !session.enabled ||
    session.staff?.role !== role
  ) {
    return <Navigate to="/staff/login" replace />;
  }

  return (
    <section className="container section">
      <p className="eyebrow">
        STAFF WORKSPACE PREVIEW
      </p>

      <h1>
        {role === "owner"
          ? "Owner workspace"
          : "Cashier workspace"}
      </h1>

      <p>
        Signed in as {getUserDisplayName(session.staff)}.
      </p>

      <p>
        Staff login is available. Workspace management features
        will be added in later commits.
      </p>

      <button
        type="button"
        className="secondary-button"
        onClick={onLogout}
        disabled={session.isSubmitting}
      >
        {session.isSubmitting
          ? "Signing out…"
          : "Log out of staff account"}
      </button>
    </section>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [city, setCity] = useState("Oulu");
  const [logoutError, setLogoutError] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  const {
    user,
    isCustomer,
    isSessionLoading,
    isSubmitting,
    logout,
  } = useAuth();

  const staffSession = useStaffSession();

  // Restore section scrolling after catalogue content loads.
  useEffect(() => {
    if (location.pathname !== "/") {
      window.scrollTo({ top: 0 });
      return;
    }

    const sectionId = location.hash.slice(1);

    if (!homeSections.has(sectionId)) return;

    function scrollIfReady() {
      const section = document.getElementById(sectionId);

      if (!section) return false;

      section.scrollIntoView({
        behavior: "smooth",
      });

      return true;
    }

    if (scrollIfReady()) return;

    const observer = new MutationObserver(() => {
      if (scrollIfReady()) {
        observer.disconnect();
      }
    });

    observer.observe(
      document.getElementById("root"),
      {
        childList: true,
        subtree: true,
      },
    );

    return () => observer.disconnect();
  }, [location.pathname, location.hash]);

  function navigateHome(event, sectionId = "home") {
    event?.preventDefault();
    setMenuOpen(false);

    const target = homeSections.has(sectionId)
      ? sectionId
      : "home";

    if (
      location.pathname === "/" &&
      location.hash === `#${target}`
    ) {
      document.getElementById(target)?.scrollIntoView({
        behavior: "smooth",
      });
    } else {
      navigate({
        pathname: "/",
        hash: `#${target}`,
      });
    }
  }

  function openMovie(movie) {
    setMenuOpen(false);

    navigate(
      `/movies/${encodeURIComponent(movie.id)}`,
    );
  }

  function openLogin() {
    setMenuOpen(false);
    navigate("/login");
  }

  function openRegister() {
    setMenuOpen(false);
    navigate("/register");
  }

  // Authentication is already performed by Login/Register.
  function handleAuthenticated() {
    setLogoutError(null);
    setMenuOpen(false);

    navigate("/#movies", {
      replace: true,
    });
  }

  async function handleLogout() {
    if (isSubmitting || isSessionLoading) return;

    setMenuOpen(false);
    setLogoutError(null);

    try {
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      setLogoutError(error);
    }
  }

  /*
   * StaffLogin authenticates once and passes its staff profile.
   * Open the workspace belonging to the returned role.
   */
  function handleStaffAuthenticated(account) {
    if (
      !["owner", "cashier"].includes(account?.role)
    ) {
      throw new Error(
        "An owner or cashier account is required.",
      );
    }

    setMenuOpen(false);
    setLogoutError(null);

    navigate(
      account.role === "owner"
        ? "/admin"
        : "/cashier",
      { replace: true },
    );
  }

  async function handleStaffLogout() {
    if (staffSession.isSubmitting) return;

    setLogoutError(null);

    try {
      await staffSession.logout();

      navigate("/staff/login", {
        replace: true,
      });
    } catch (error) {
      setLogoutError(error);
    }
  }

  const backToMovies = () =>
    navigateHome(undefined, "movies");

  const viewingStaffWorkspace =
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/cashier");

  return (
    <CustomerLayout
      onLogoClick={(event) => navigateHome(event)}
      headerProps={{
        menuOpen,
        setMenuOpen,
        user: isCustomer ? user : null,
        navigateHome,
        openLogin,
        handleLogout,
        openBookingHistory: () => {
          navigate("/my-bookings");
        },
      }}
    >
      {logoutError && (
        <div className="container">
          <RequestState
            error={logoutError}
            onRetry={
              viewingStaffWorkspace
                ? handleStaffLogout
                : handleLogout
            }
          />
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <CatalogueHome
              city={city}
              onCityChange={setCity}
              navigateHome={navigateHome}
              openMovie={openMovie}
            />
          }
        />

        <Route
          path="/movies/:movieId"
          element={
            <MovieDetails
              city={city}
              onBack={backToMovies}
            />
          }
        />

        <Route
          path="/login"
          element={
            <Login
              onLogin={handleAuthenticated}
              onRegister={openRegister}
              onStaffLogin={() => {
                navigate("/staff/login");
              }}
            />
          }
        />

        <Route
          path="/register"
          element={
            <Register
              onRegister={handleAuthenticated}
              onLogin={openLogin}
            />
          }
        />

        <Route
          path="/staff/login"
          element={
            <StaffLogin
              onAuthenticated={handleStaffAuthenticated}
              onCustomerLogin={openLogin}
            />
          }
        />

        <Route
          path="/admin"
          element={
            <StaffWorkspace
              role="owner"
              session={staffSession}
              onLogout={handleStaffLogout}
            />
          }
        />

        <Route
          path="/cashier"
          element={
            <StaffWorkspace
              role="cashier"
              session={staffSession}
              onLogout={handleStaffLogout}
            />
          }
        />

        <Route
          path="/my-bookings"
          element={
            <FeaturePlaceholder
              title="My bookings"
              onBack={backToMovies}
            >
              Booking history will be added with the booking flow.
            </FeaturePlaceholder>
          }
        />

        <Route
          path="*"
          element={
            <FeaturePlaceholder
              title="Page unavailable"
              onBack={backToMovies}
            >
              This page has not been added to the new frontend yet.
            </FeaturePlaceholder>
          }
        />
      </Routes>
    </CustomerLayout>
  );
}

export default App;