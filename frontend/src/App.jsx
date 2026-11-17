/*
 * FILE: frontend/src/App.jsx
 * Catalogue, customer authentication and staff account management.
 * Staff routes use their own navigation. Unfinished owner tabs show previews.
 * main.jsx already provides BrowserRouter.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router-dom";
import CustomerLayout from "./layouts/CustomerLayout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
import CatalogueHome from "./pages/CatalogueHome.jsx";
import MovieDetails from "./pages/MovieDetails.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import StaffLogin from "./pages/StaffLogin.jsx";
import SeatSelection from "./pages/SeatSelection.jsx";
import Checkout from "./pages/Checkout.jsx";
import BookingConfirmation from "./pages/BookingConfirmation.jsx";
import BookingHistory from "./pages/BookingHistory.jsx";
import { booking as bookingService, bookingEnabled } from "./services/booking.js";
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
              <h2>{Object.hasOwn(ownerTabs, tab) ? ownerTabs[tab] : "Page unavailable"}</h2>
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
  const [navigationError, setNavigationError] = useState("");
  const [checkoutDraft, setCheckoutDraft] = useState(null);
  const checkoutNavigationLocked = useRef(false);
  const [purchaseNavigationLocked, setPurchaseNavigationLocked] = useState(false);
  const navigationInProgress = useRef(false);
  const { user, isCustomer, isSessionLoading, isSubmitting, logout } =
    useAuth();
  const staffSession = useStaffSession();
  const navigate = useNavigate();
  const location = useLocation();
  const seatsMatch = useMatch("/screenings/:screeningId/seats");
  const checkoutMatch = useMatch("/checkout/:holdId");
  const reportCheckoutLock = useCallback((locked) => {
    checkoutNavigationLocked.current = locked;
    setPurchaseNavigationLocked(locked);
  }, []);

  function assertPurchaseResolved() {
    let savedPurchase = false;
    const holdId = checkoutDraft?.holdId ?? checkoutMatch?.params.holdId;
    if (holdId) {
      try {
        savedPurchase = Boolean(JSON.parse(
          sessionStorage.getItem(`rio:checkout:${holdId}`) || "null",
        )?.purchase);
      } catch {
        // The synchronous checkout callback still guards when storage is blocked.
      }
    }
    if (checkoutNavigationLocked.current || savedPurchase) {
      throw new Error("Finish or recover the purchase in checkout before navigating or changing accounts.");
    }
  }

  function go(path, options) {
    setMenuOpen(false);
    setNavigationError("");
    navigate(path, options);
  }

  async function releaseHoldIfPresent(holdId) {
    if (!holdId) return;
    try {
      await bookingService.releaseHold(holdId);
    } catch (error) {
      if (![404, 410].includes(error.status) && error.code !== "HOLD_ALREADY_CONSUMED") throw error;
    }
  }

  async function releaseCheckout() {
    assertPurchaseResolved();
    await releaseHoldIfPresent(checkoutDraft?.holdId ?? checkoutMatch?.params.holdId);
    setCheckoutDraft(null);
  }

  async function navigateSafely(action, { release = true } = {}) {
    if (navigationInProgress.current) return;
    navigationInProgress.current = true;
    try {
      assertPurchaseResolved();
      if (release) await releaseCheckout();
      await action();
    } catch (error) {
      setNavigationError(error.message || "Unable to leave checkout.");
    } finally {
      navigationInProgress.current = false;
    }
  }

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
    const target = homeSections.has(sectionId) ? sectionId : "home";
    void navigateSafely(() => {
      go(`/#${target}`);
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function openMovie(movie) {
    void navigateSafely(() => go(`/movies/${encodeURIComponent(movie.id)}`));
  }

  function openSeatSelection(screeningId) {
    if (!bookingEnabled) return;
    void navigateSafely(() => go(`/screenings/${encodeURIComponent(screeningId)}/seats`));
  }

  async function returnToMovie() {
    try {
      const response = await bookingService.getScreening(seatsMatch?.params.screeningId);
      void navigateSafely(() => go(`/movies/${encodeURIComponent(response.data.movieId)}`));
    } catch {
      navigateHome(undefined, "movies");
    }
  }

  // SeatSelection creates the hold; App only stores navigation context.
  function handleHoldCreated(hold) {
    if (typeof hold?.id !== "string" || typeof hold.screeningId !== "string") {
      throw new Error("The hold is missing its identifiers.");
    }
    setCheckoutDraft((previous) => ({
      holdId: hold.id,
      screeningId: hold.screeningId,
      customer: previous?.screeningId === hold.screeningId ? previous.customer : undefined,
    }));
    go(`/checkout/${encodeURIComponent(hold.id)}`, {
      state: { screeningId: hold.screeningId },
    });
  }

  async function returnToSeats(draft) {
    assertPurchaseResolved();
    await releaseHoldIfPresent(draft?.holdId);
    setCheckoutDraft({
      holdId: null,
      screeningId: draft?.screeningId,
      customer: { name: draft?.customer?.name ?? "", email: draft?.customer?.email ?? "" },
    });
    go(draft?.screeningId
      ? `/screenings/${encodeURIComponent(draft.screeningId)}/seats`
      : "/#movies");
  }

  function handleBookingCreated(receipt) {
    if (typeof receipt?.reference !== "string" || receipt.bookingStatus !== "confirmed" ||
        !["simulated", "paid"].includes(receipt.paymentStatus)) {
      throw new Error("The purchase result could not be confirmed. Retry from checkout.");
    }
    checkoutNavigationLocked.current = false;
    setPurchaseNavigationLocked(false);
    setCheckoutDraft(null);
    go(`/bookings/${encodeURIComponent(receipt.reference)}/confirmation`, { replace: true });
  }

  // Header login keeps the hold; checkout checkpoints preserve its contacts.
  function openLogin() {
    void navigateSafely(() => go("/login", {
      state: { returnTo: location.pathname === "/staff/login"
        ? "/" : location.pathname + location.hash },
    }), { release: false });
  }

  function openCheckoutLogin(draft) {
    assertPurchaseResolved();
    if (draft?.holdId !== checkoutMatch?.params.holdId) return;
    setCheckoutDraft(draft);
    go("/login", { state: { returnTo: `/checkout/${encodeURIComponent(draft.holdId)}` } });
  }

  function openRegister() {
    void navigateSafely(() => go("/register", {
      state: { returnTo: location.state?.returnTo ?? "/" },
    }), { release: false });
  }

  function loginFromRegister() {
    void navigateSafely(() => go("/login", {
      state: { returnTo: location.state?.returnTo ?? "/" },
    }), { release: false });
  }

  // Forms already authenticated. Never submit their credentials a second time.
  function handleAuthenticated(account) {
    if (account?.role !== "customer") return;
    const requested = location.state?.returnTo;
    const allowed = typeof requested === "string" && requested.startsWith("/") &&
      !requested.startsWith("//") && !requested.includes("\\") &&
      !["/login", "/register", "/staff/login"].includes(requested.split(/[?#]/)[0]);
    setLogoutError(null);
    go(allowed ? requested : "/#movies", { replace: true });
  }

  function openBookingHistory() {
    void navigateSafely(() => go("/my-bookings"));
  }

  async function handleLogout() {
    if (isSubmitting || isSessionLoading) return;
    setLogoutError(null);
    await navigateSafely(async () => {
      await logout();
      go("/", { replace: true });
    });
  }

  function openStaffLogin() {
    void navigateSafely(() => go("/staff/login"));
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
    void navigateSafely(() => go(`/admin/${tab}`));
  }

  function handleLogoClick(event) {
    if (ownerOpen || cashierOpen) {
      event?.preventDefault();
      void navigateSafely(() => go(ownerOpen ? "/admin/cashiers" : "/cashier"));
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
        openBookingHistory,
      }}
    >
      {navigationError && (
        <div className="container"><p className="admin-edit-error" role="alert">{navigationError}</p></div>
      )}
      {checkoutDraft?.holdId && !checkoutMatch &&
        !["/login", "/register"].includes(location.pathname) && (
          <div className="container">
            <button type="button" className="secondary-button" onClick={() => go(
              `/checkout/${encodeURIComponent(checkoutDraft.holdId)}`,
            )}>Return to your checkout</button>
          </div>
        )}
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
          element={<MovieDetails city={city} onBack={backToMovies}
            onChooseSeats={openSeatSelection} />}
        />
        <Route path="/screenings/:screeningId/seats" element={
          !bookingEnabled ? <FeaturePlaceholder title="Booking unavailable" onBack={backToMovies}>Use matching demo modes.</FeaturePlaceholder>
            : checkoutDraft?.holdId ? <Navigate to={`/checkout/${encodeURIComponent(checkoutDraft.holdId)}`} replace />
            : <SeatSelection onBack={returnToMovie} onHoldCreated={handleHoldCreated} />
        } />
        <Route path="/checkout/:holdId" element={
          <Checkout contactDraft={checkoutDraft} onLogin={openCheckoutLogin}
            onBack={returnToSeats} onBookingCreated={handleBookingCreated}
            onNavigationLockChange={reportCheckoutLock} />
        } />
        <Route path="/bookings/:reference/confirmation" element={
          <BookingConfirmation onBackToMovies={backToMovies} onViewBookings={openBookingHistory} />
        } />
        <Route
          path="/login"
          element={
            purchaseNavigationLocked && checkoutDraft?.holdId
              ? <Navigate to={`/checkout/${encodeURIComponent(checkoutDraft.holdId)}`} replace />
              : <Login
              onLogin={handleAuthenticated}
              onRegister={openRegister}
              onStaffLogin={openStaffLogin}
            />
          }
        />
        <Route
          path="/register"
          element={
            purchaseNavigationLocked && checkoutDraft?.holdId
              ? <Navigate to={`/checkout/${encodeURIComponent(checkoutDraft.holdId)}`} replace />
              : <Register onRegister={handleAuthenticated} onLogin={loginFromRegister} />
          }
        />
        <Route
          path="/staff/login"
          element={
            purchaseNavigationLocked && checkoutDraft?.holdId
              ? <Navigate to={`/checkout/${encodeURIComponent(checkoutDraft.holdId)}`} replace />
              : <StaffLogin
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
            isSessionLoading ? <RequestState loading loadingMessage="Checking your account…" />
              : !isCustomer ? <Navigate to="/login" state={{ returnTo: "/my-bookings" }} replace />
              : <BookingHistory onExploreMovies={backToMovies} />
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
