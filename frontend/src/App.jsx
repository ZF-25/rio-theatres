/*
 * FILE: frontend/src/App.jsx
 *
 * Customer catalogue, movie details and screening discovery.
 * Authentication and booking are added in later batches.
 *
 * main.jsx already supplies BrowserRouter.
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

  const navigate = useNavigate();
  const location = useLocation();

  /*
   * Scroll to home sections after asynchronous catalogue
   * content has mounted.
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

  /*
   * Movie cards pass their movie record.
   * The details page loads fresh data using the route ID.
   */
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

  const backToMovies = () =>
    navigateHome(undefined, "movies");

  return (
    <CustomerLayout
      onLogoClick={(event) => navigateHome(event)}
      headerProps={{
        menuOpen,
        setMenuOpen,
        user: null,
        navigateHome,
        openLogin,
      }}
    >
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
            <FeaturePlaceholder
              title="Customer login"
              onBack={backToMovies}
            >
              Login and registration will be added in
              the authentication batch.
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
              This page has not been added to the new
              frontend yet.
            </FeaturePlaceholder>
          }
        />
      </Routes>
    </CustomerLayout>
  );
}

export default App;