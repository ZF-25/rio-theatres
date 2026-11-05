// Link navigates between React Router pages without refreshing
// the entire website.
import { Link } from 'react-router-dom'

// Import the logo so Vite can locate it and include it
// in the production build.
import logo from '../assets/rio-theaters-logo.png'

// The footer is shared by the customer and administrator layouts.
//
// It does not need an onLogoClick prop because React Router's
// Link handles navigation to the homepage.
function Footer() {
  // Get the current year from the user's device.
  // This avoids manually updating the copyright year every January.
  const currentYear = new Date().getFullYear()

  return (
    // <footer> identifies the footer area of the page.
    // This class applies the background, border, and spacing
    // defined in App.css.
    <footer className="site-footer">
      {/* The container limits the content width.
          footer-content arranges the logo and copyright text
          horizontally on desktop and vertically on small screens. */}
      <div className="container footer-content">
        {/* The logo always links to the customer homepage.
            aria-label gives the link an accessible name that
            explains its destination to screen reader users. */}
        <Link
          className="logo-link"
          to="/"
          aria-label="Rio Theaters home"
        >
          {/* alt describes the logo if it cannot be seen or loaded.
              loading="lazy" allows the browser to delay loading
              this image when it is outside the visible page area. */}
          <img
            className="footer-logo"
            src={logo}
            alt="Rio Theaters"
            loading="lazy"
          />
        </Link>

        {/* Curly braces insert the JavaScript year value into JSX. */}
        <p>© {currentYear} Rio Theaters</p>
      </div>
    </footer>
  )
}

// Export Footer so both layouts can import and render it.
// Example: import Footer from '../components/Footer.jsx'
export default Footer