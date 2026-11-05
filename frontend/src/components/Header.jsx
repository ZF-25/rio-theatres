// useState lets this component remember whether the mobile menu is open.
import { useState } from 'react'

// Link and NavLink navigate between React Router pages without
// refreshing the entire website.
//
// NavLink also adds aria-current="page" when its route is active.
// Our CSS uses that attribute to highlight the current page.
import { Link, NavLink } from 'react-router-dom'

// Importing the logo allows Vite to find it and include it
// in the production build.
import logo from '../assets/rio-theaters-logo.png'

// Each navigation item is an array containing:
// [the destination URL, the text displayed to the user]
//
// Keeping these items in an array means we can generate the links
// with map() instead of repeating the same JSX for every link.
//
// These match the public links in the original design.
// My bookings is not displayed in the public navigation.
const customerNavigation = [
  ['/movies', 'Movies'],
  ['/locations', 'Locations'],
  ['/contact', 'Contact'],
  ['/about', 'About'],
]

// Administrator pages use a different set of navigation links.
// Their URLs start with /admin to keep them grouped together.
//
// These links only provide navigation. They do not protect admin
// pages. Authentication and permissions will be implemented later.
const adminNavigation = [
  ['/admin', 'Overview'],
  ['/admin/screenings', 'Screenings'],
  ['/admin/bookings', 'Bookings'],
  ['/admin/seats', 'Seats'],
  ['/admin/cashiers', 'Cashiers'],
]

// The variant prop decides which version of the header to display.
//
// Examples:
// <Header />                  displays customer navigation.
// <Header variant="admin" />  displays administrator navigation.
//
// If no variant is provided, it defaults to "customer".
function Header({ variant = 'customer' }) {
  // menuOpen stores the mobile menu's current state:
  // false means closed; true means open.
  //
  // Calling setMenuOpen updates the state and causes React to
  // render the component again with the new value.
  const [menuOpen, setMenuOpen] = useState(false)

  // This comparison produces a boolean: true or false.
  // We reuse it to choose the logo destination, links, and labels.
  const isAdmin = variant === 'admin'

  // The ternary operator chooses one of the two navigation arrays:
  // condition ? valueIfTrue : valueIfFalse
  const navigation = isAdmin
    ? adminNavigation
    : customerNavigation

  // Close the mobile menu after a user selects a navigation link.
  // On desktop, setting this state to false has no visual effect
  // because CSS displays the desktop navigation independently.
  function closeMenu() {
    setMenuOpen(false)
  }

  // Keyboard events from elements inside the header bubble up
  // to the header, allowing this handler to detect Escape.
  function handleKeyDown(event) {
    // Only act when Escape is pressed and the menu is open.
    if (event.key === 'Escape' && menuOpen) {
      setMenuOpen(false)

      // currentTarget is the header element where this handler
      // is attached. Find its menu button and return focus to it.
      //
      // This prevents keyboard focus from remaining inside the
      // navigation after the mobile menu has been hidden.
      //
      // The ?. operator calls focus() only if the button exists.
      event.currentTarget
        .querySelector('.menu-toggle')
        ?.focus()
    }
  }

  return (
    // <header> identifies the introductory area of the page.
    // className connects this element to our CSS styles.
    <header
      className="site-header"
      onKeyDown={handleKeyDown}
    >
      {/* This container controls the width and alignment
          of the logo, menu button, and navigation. */}
      <div className="container header-content">
        {/* Link changes the route without a full page reload.
            The logo leads to the appropriate home page. */}
        <Link
          className="logo-link"
          to={isAdmin ? '/admin' : '/'}
          aria-label={
            isAdmin
              ? 'Rio Theaters admin overview'
              : 'Rio Theaters home'
          }
          onClick={closeMenu}
        >
          {/* alt describes the image for users who cannot see it.
              The link's aria-label describes its destination. */}
          <img
            className="navbar-logo"
            src={logo}
            alt="Rio Theaters"
          />
        </Link>

        {/* CSS shows this button on smaller screens.
            type="button" prevents accidental form submission. */}
        <button
          type="button"
          className="menu-toggle"
          // Tell assistive technology whether the menu is open.
          aria-expanded={menuOpen}
          // Connect the button to the navigation element below.
          aria-controls="main-navigation"
          // Use the previous state to switch between open and closed.
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Close menu' : 'Menu'}
        </button>

        {/* <nav> identifies a group of navigation links.
            The accessible label explains which navigation this is. */}
        <nav
          id="main-navigation"
          // Add "is-open" when the mobile menu is open.
          // Our responsive CSS uses this class to show the menu.
          className={`main-navigation ${
            menuOpen ? 'is-open' : ''
          }`}
          aria-label={
            isAdmin
              ? 'Administration navigation'
              : 'Main navigation'
          }
        >
          {/* map() creates a NavLink for each item in the array.
              [path, label] extracts the URL and text from each pair. */}
          {navigation.map(([path, label]) => (
            <NavLink
              // React uses a unique key to identify each list item
              // when updating the rendered navigation.
              key={path}
              to={path}
              // Match the complete route. For example, /admin
              // should not also be active on /admin/bookings.
              end
              onClick={closeMenu}
            >
              {label}
            </NavLink>
          ))}

          {/* Render a different final link for each header variant.
              Both use auth-link for the highlighted button styling. */}
          {isAdmin ? (
            // This navigates back to the customer website.
            // It is not a logout action because authentication
            // has not been implemented in the team repo yet.
            <Link
              className="auth-link"
              to="/"
              onClick={closeMenu}
            >
              Back to website
            </Link>
          ) : (
            // NavLink automatically marks this link as current
            // when the user visits the login page.
            <NavLink
              className="auth-link"
              to="/login"
              onClick={closeMenu}
            >
              Log in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}

// Export the component so other files can import and render it.
// For example: import Header from '../components/Header.jsx'
export default Header