/*
 * FILE: frontend/src/App.jsx
 *
 * Shared layout and navigation shell.
 *
 * main.jsx already provides BrowserRouter.
 * Do not add another BrowserRouter here.
 *
 * These placeholders will be replaced by real pages later.
 * This shell does not authenticate users or connect to backend APIs.
 */

import { useState } from "react";

import {
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import CustomerLayout from "./layouts/CustomerLayout.jsx";

import "./App.css";

/*
 * Temporary home sections keep the header navigation functional
 * while the customer pages are added.
 */
const sections = [
  {
    id: "movies",
    title: "Movies",
    text: "Movie browsing and screening information will be added in the catalogue batch.",
  },
  {
    id: "locations",
    title: "Our theaters",
    text: "Rio Theaters operates in Oulu and Tampere.",
  },
  {
    id: "contact",
    title: "Contact",
    text: "Theater contact information will be added with the customer pages.",
  },
  {
    id: "about",
    title: "About Rio Theaters",
    text: "A cinema booking application for customers, owners and cashiers.",
  },
];

function HomeShell() {
  return (
    <div className="container">
      <section id="home" className="section">
        <p className="eyebrow">RIO THEATERS</p>

        <h1>Welcome to Rio Theaters</h1>

        <p>
          Shared layout and navigation preview. Feature pages
          are being added in separate commits.
        </p>
      </section>

      {sections.map(({ id, title, text }) => (
        <section key={id} id={id} className="section">
          <h2>{title}</h2>
          <p>{text}</p>
        </section>
      ))}
    </div>
  );
}

/*
 * Reusable temporary content for routes not implemented.
 */
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
        Back to home
      </button>
    </section>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  /*
   * Used by the logo, home-section navigation and Back buttons.
   */
  function goHome(event, sectionId = "home") {
    event?.preventDefault();
    setMenuOpen(false);

    if (location.pathname === "/") {
      navigate({
        pathname: "/",
        hash: `#${sectionId}`,
      });

      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
      });

      return;
    }

    navigate({
      pathname: "/",
      hash: `#${sectionId}`,
    });

    // Wait for the home sections to mount after navigation.
    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
      });
    });
  }

  function openLogin() {
    setMenuOpen(false);
    navigate("/login");
  }

  const backHome = () => goHome();

  return (
    <CustomerLayout
      onLogoClick={(event) => goHome(event)}
      headerProps={{
        menuOpen,
        setMenuOpen,

        // No authentication is connected.
        user: null,

        navigateHome: goHome,
        openLogin,
      }}
    >
      <Routes>
        <Route
          path="/"
          element={<HomeShell />}
        />

        <Route
          path="/login"
          element={
            <FeaturePlaceholder
              title="Customer login"
              onBack={backHome}
            >
              Login and registration will be connected in
              the authentication batch.
            </FeaturePlaceholder>
          }
        />

        <Route
          path="*"
          element={
            <FeaturePlaceholder
              title="Page unavailable"
              onBack={backHome}
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