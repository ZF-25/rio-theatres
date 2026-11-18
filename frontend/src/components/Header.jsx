/*
 * FILE: frontend/src/components/Header.jsx
 *
 * PURPOSE
 * -------
 * Displays navigation for customers, owners, and cashiers.
 *
 * ACCOUNT NAME UPDATE
 * -------------------
 * The cashier label uses getUserDisplayName() so it supports
 * firstName and lastName from both demo and API profiles.
 *
 * Navigation and logout callbacks are supplied by App.jsx.
 * This component does not authenticate users or load accounts.
 */

import logo from "../assets/rio-theaters-logo.png";
import { getUserDisplayName } from "../utils/userName.js";

const customerNavigation = [
  ["movies", "Movies"],
  ["locations", "Locations"],
  ["contact", "Contact"],
  ["about", "About"],
];

const adminNavigation = [
  ["overview", "Overview"],
  ["screenings", "Screenings"],
  ["bookings", "Bookings"],
  ["seats", "Seats"],
  ["cashiers", "Cashiers"],
];

function Header({
  adminOpen = false,
  cashierOpen = false,
  currentStaff,
  adminTab,
  menuOpen,
  setMenuOpen,
  user,
  onLogoClick,
  navigateHome,
  changeAdminTab,
  exitAdminPreview,
  onStaffLogout,
  openBookingHistory,
  handleLogout,
  openLogin,
}) {
  // Support the existing logout prop while accepting the newer name.
  const staffLogout = onStaffLogout ?? exitAdminPreview;

  const navigationLabel = adminOpen
    ? "Administration navigation"
    : cashierOpen
      ? "Cashier navigation"
      : "Main navigation";

  const logoLabel = adminOpen
    ? "Rio Theaters admin overview"
    : cashierOpen
      ? "Rio Theaters cashier reservations"
      : "Rio Theaters home";

  function closeMenu() {
    setMenuOpen(false);
  }

  function logoutStaff() {
    closeMenu();
    staffLogout?.();
  }

  function openReservations(event) {
    closeMenu();
    onLogoClick?.(event);
  }

  return (
    <header className="site-header">
      <div className="container header-content">
        <a
          className="logo-link"
          href={cashierOpen ? "#cashier-page-title" : "#home"}
          aria-label={logoLabel}
          onClick={onLogoClick}
        >
          <img className="navbar-logo" src={logo} alt="Rio Theaters" />
        </a>

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close menu" : "Menu"}
        </button>

        <nav
          id="main-navigation"
          className={`main-navigation ${menuOpen ? "is-open" : ""}`}
          aria-label={navigationLabel}
        >
          {adminOpen ? (
            <>
              {/* OWNER NAVIGATION */}
              {adminNavigation.map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className="nav-link-button admin-nav-button"
                  aria-current={adminTab === tab ? "page" : undefined}
                  onClick={() => {
                    closeMenu();
                    changeAdminTab(tab);
                  }}
                >
                  {label}
                </button>
              ))}

              <button
                type="button"
                className="auth-button"
                onClick={logoutStaff}
              >
                Log out
              </button>
            </>
          ) : cashierOpen ? (
            <>
              {/* CASHIER NAVIGATION */}
              <a
                href="#cashier-page-title"
                aria-current="page"
                onClick={openReservations}
              >
                Reservations
              </a>

              {currentStaff && (
                <span className="staff-nav-name">
                  Cashier: {getUserDisplayName(currentStaff, "Cashier")}
                </span>
              )}

              <button
                type="button"
                className="auth-button"
                onClick={logoutStaff}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              {/* CUSTOMER NAVIGATION */}
              {customerNavigation.map(([sectionId, label]) => (
                <a
                  key={sectionId}
                  href={`#${sectionId}`}
                  onClick={(event) => navigateHome(event, sectionId)}
                >
                  {label}
                </a>
              ))}

              {user ? (
                <>
                  <button
                    type="button"
                    className="nav-link-button"
                    onClick={openBookingHistory}
                  >
                    My bookings
                  </button>

                  <button
                    type="button"
                    className="auth-button"
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="auth-button"
                  onClick={openLogin}
                >
                  Log in
                </button>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Header;
