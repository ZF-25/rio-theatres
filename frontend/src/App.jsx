/*
 * FILE: frontend/src/App.jsx
 *
 * BATCH 2
 * Working homepage and movie catalogue.
 *
 * Movie details, authentication and booking are added later.
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
   * Home sections appear after catalogue reference data loads.
   *
   * If navigation happens before they mount, observe the rendered
   * content until the requested section becomes available.
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

  /*
   * Shared navigation for the header, logo and return buttons.
   */
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
   * Movie cards already pass the selected movie record.
   * Details use a placeholder until the next batch.
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
            <FeaturePlaceholder
              title="Movie details"
              onBack={backToMovies}
            >
              Movie details and screening selection will
              be added in the next batch.
            </FeaturePlaceholder>
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