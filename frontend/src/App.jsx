/*
 * FILE: frontend/src/App.jsx
 * Catalogue, customer authentication and staff account management.
 * Staff routes use their own navigation. Unfinished owner tabs show previews.
 * main.jsx already provides BrowserRouter.
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
import AdminLayout from "./layouts/AdminLayout.jsx";
import CatalogueHome from "./pages/CatalogueHome.jsx";
import MovieDetails from "./pages/MovieDetails.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import StaffLogin from "./pages/StaffLogin.jsx";
import { useStaffSession } from "./hooks/useStaffSession.js";
import { getUserDisplayName } from "./utils/userName.js";
import RequestState from "./components/RequestState.jsx";
import AdminCashiers from "./components/AdminCashiers.jsx";
import { useAuth } from "./hooks/useAuth.js";
import "./App.css";

const homeSections = new Set([
  "home",
  "movies",
  "locations",
  "contact",
  "about",
]);
const ownerTabs = {
  overview: "Overview",
  screenings: "Screenings",
  bookings: "Bookings",
  seats: "Seats",
  cashiers: "Cashiers",
};

function FeaturePlaceholder({ title, children, onBack }) {
  return (
    <section className="container section">
      <h1>{title}</h1>
      <p>{children}</p>
      <button type="button" className="secondary-button" onClick={onBack}>
        Back to movies
      </button>
    </section>
  );
}

/* These previews use route guards, not real backend authorization. */
function StaffWorkspace({ role, session, onLogout, tab = "cashiers" }) {
  if (session.isSessionLoading) {
    return <RequestState loading loadingMessage="Checking staff access…" />;
  }
  if (session.status === "error") {
    return (
      <RequestState
        error={session.sessionError}
        onRetry={() => session.refreshSession()}
      />
    );
  }
  if (!session.enabled || session.staff?.role !== role) {
    return <Navigate to="/staff/login" replace />;
  }
  return (
    <section className="container section">
      <p className="eyebrow">STAFF WORKSPACE PREVIEW</p>
      <h1>{role === "owner" ? "Owner workspace" : "Cashier workspace"}</h1>
      <p>Signed in as {getUserDisplayName(session.staff)}.</p>
      {role === "owner" ? (
        <>
          {tab === "cashiers" ? (
            <>
              <p>
                Manage cashier accounts and their single-theater access below.
              </p>
              <AdminCashiers />
            </>
          ) : (
            <section>
              <h2>{ownerTabs[tab] ?? "Page unavailable"}</h2>
              <p>
                This owner feature will be added in a later batch. Use Cashiers
                to manage staff accounts.
              </p>
            </section>
          )}
        </>
      ) : (
        <p>
          Cashier login is available. The reservation workspace will be added in
          a later batch.
        </p>
      )}
      <button
        type="button"
        className="secondary-button"
        onClick={onLogout}
        disabled={session.isSubmitting}
      >
        {session.isSubmitting ? "Signing out…" : "Log out of staff account"}
      </button>
    </section>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [city, setCity] = useState("Oulu");
  const [logoutError, setLogoutError] = useState(null);
  const { user, isCustomer, isSessionLoading, isSubmitting, logout } =
    useAuth();
  const staffSession = useStaffSession();
  const navigate = useNavigate();
  const location = useLocation();

  /* Catalogue sections mount after asynchronous reference data loads.
   * Observe that mount so navigation from another route can still scroll.
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
      section.scrollIntoView({ behavior: "smooth" });
      return true;
    }
    if (scrollIfReady()) return;
    const observer = new MutationObserver(() => {
      if (scrollIfReady()) observer.disconnect();
    });
    observer.observe(document.getElementById("root"), {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [location.pathname, location.hash]);

  function navigateHome(event, sectionId = "home") {
    event?.preventDefault();
    setMenuOpen(false);
    const target = homeSections.has(sectionId) ? sectionId : "home";
    if (location.pathname === "/" && location.hash === `#${target}`) {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate({ pathname: "/", hash: `#${target}` });
    }
  }

  function openMovie(movie) {
    setMenuOpen(false);
    navigate(`/movies/${encodeURIComponent(movie.id)}`);
  }

  function openLogin() {
    setMenuOpen(false);
    navigate("/login");
  }

  function openRegister() {
    setMenuOpen(false);
    navigate("/register");
  }

  // Login/Register already perform authentication. Only navigate here.
  function handleAuthenticated() {
    setLogoutError(null);
    setMenuOpen(false);
    navigate("/#movies", { replace: true });
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

  function handleStaffAuthenticated(account) {
    if (!["owner", "cashier"].includes(account?.role)) {
      throw new Error("An owner or cashier account is required.");
    }
    setMenuOpen(false);
    setLogoutError(null);
    navigate(account.role === "owner" ? "/admin" : "/cashier", {
      replace: true,
    });
  }

  async function handleStaffLogout() {
    if (staffSession.isSubmitting) return;
    setLogoutError(null);
    setMenuOpen(false);
    try {
      await staffSession.logout();
      navigate("/staff/login", { replace: true });
    } catch (error) {
      setLogoutError(error);
    }
  }

  const backToMovies = () => navigateHome(undefined, "movies");
  const ownerOpen =
    location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const cashierOpen =
    location.pathname === "/cashier" ||
    location.pathname.startsWith("/cashier/");
  const adminTab = location.pathname.split("/")[2] || "cashiers";
  const Layout = ownerOpen ? AdminLayout : CustomerLayout;

  function changeAdminTab(tab) {
    if (!Object.hasOwn(ownerTabs, tab)) return;
    setMenuOpen(false);
    navigate(`/admin/${tab}`);
  }

  function handleLogoClick(event) {
    if (ownerOpen || cashierOpen) {
      event?.preventDefault();
      setMenuOpen(false);
      navigate(ownerOpen ? "/admin/cashiers" : "/cashier");
    } else {
      navigateHome(event);
    }
  }

  return (
    <Layout
      onLogoClick={handleLogoClick}
      headerProps={{
        menuOpen,
        setMenuOpen,
        adminOpen: ownerOpen,
        cashierOpen,
        currentStaff: staffSession.staff,
        adminTab,
        changeAdminTab,
        onStaffLogout: handleStaffLogout,
        user: isCustomer ? user : null,
        navigateHome,
        openLogin,
        handleLogout,
        openBookingHistory: () => navigate("/my-bookings"),
      }}
    >
      {logoutError && (
        <div className="container">
          <RequestState
            error={logoutError}
            onRetry={
              location.pathname.startsWith("/admin") ||
              location.pathname.startsWith("/cashier")
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
          element={<MovieDetails city={city} onBack={backToMovies} />}
        />
        <Route
          path="/login"
          element={
            <Login
              onLogin={handleAuthenticated}
              onRegister={openRegister}
              onStaffLogin={() => navigate("/staff/login")}
            />
          }
        />
        <Route
          path="/register"
          element={
            <Register onRegister={handleAuthenticated} onLogin={openLogin} />
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
          path="/admin/:tab"
          element={
            <StaffWorkspace
              role="owner"
              session={staffSession}
              onLogout={handleStaffLogout}
              tab={adminTab}
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
            <FeaturePlaceholder title="My bookings" onBack={backToMovies}>
              Booking history will be added with the booking flow.
            </FeaturePlaceholder>
          }
        />
        <Route
          path="*"
          element={
            <FeaturePlaceholder title="Page unavailable" onBack={backToMovies}>
              This page has not been added to the new frontend yet.
            </FeaturePlaceholder>
          }
        />
      </Routes>
    </Layout>
  );
}

export default App;
