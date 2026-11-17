/*
 * FILE: frontend/src/App.jsx
 *
 * Includes:
 * - Customer catalogue.
 * - Movie details and screening discovery.
 * - Customer registration, login and logout.
 *
 * Booking and staff workspaces arrive in later batches.
 * main.jsx already supplies BrowserRouter and AuthProvider.
 */

import { useEffect, useState } from "react";

import {
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

import RequestState from "./components/RequestState.jsx";

import { useAuth } from "./hooks/useAuth.js";

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

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [city, setCity] = useState("Oulu");
  const [logoutError, setLogoutError] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  /*
   * Identity and authentication actions come from AuthProvider.
   * App does not submit login credentials itself.
   */
  const {
    user,
    isCustomer,
    isSessionLoading,
    isSubmitting,
    logout,
  } = useAuth();

  /*
   * Scroll to home sections after catalogue content mounts.
   */
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

  /*
   * Login/Register already performed authentication.
   * Their success callback only handles navigation here.
   */
  function handleAuthenticated() {
    setLogoutError(null);
    setMenuOpen(false);

    navigate("/#movies", {
      replace: true,
    });
  }

  /*
   * Only navigate after logout succeeds.
   * A failure remains visible and can be retried.
   */
  async function handleLogout() {
    if (isSubmitting || isSessionLoading) return;

    setMenuOpen(false);
    setLogoutError(null);

    try {
      await logout();

      navigate("/", {
        replace: true,
      });
    } catch (error) {
      setLogoutError(error);
    }
  }

  const backToMovies = () =>
    navigateHome(undefined, "movies");

  return (
    <CustomerLayout
      onLogoClick={(event) => navigateHome(event)}
      headerProps={{
        menuOpen,
        setMenuOpen,

        // Show customer controls only for a customer identity.
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
            onRetry={handleLogout}
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
            <FeaturePlaceholder
              title="Staff login"
              onBack={backToMovies}
            >
              The staff workspace will be added in a later batch.
            </FeaturePlaceholder>
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