// Outlet displays the child page matched by React Router.
// This lets several pages share one header, main area, and footer.
import { Outlet } from 'react-router-dom'

// Import the shared navigation and footer components.
import Header from '../components/Header.jsx'
import Footer from '../components/Footer.jsx'

// variant defaults to "customer" for normal website pages.
// AdminLayout can reuse this layout with variant="admin".
function CustomerLayout({ variant = 'customer' }) {
  return (
    // The app class creates a full-height column layout.
    // admin-app provides an additional CSS hook for admin pages.
    <div
      className={
        variant === 'admin' ? 'app admin-app' : 'app'
      }
    >
      {/* Keyboard users can skip the navigation and move directly
          to the main content. The link becomes visible on focus. */}
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      {/* The variant determines which navigation links appear.
          Header handles its own mobile menu and router links. */}
      <Header variant={variant} />

      {/* main identifies the page's primary content.
          site-main allows this area to grow and push the footer down.
          tabIndex={-1} makes it focusable by the skip link without
          adding it to the normal Tab key sequence. */}
      <main
        className="site-main"
        id="main-content"
        tabIndex={-1}
      >
        {/* React Router renders the matching nested page here.
            We no longer pass page content through children. */}
        <Outlet />
      </main>

      {/* The same footer appears on customer and admin pages.
          Its homepage link is handled by React Router. */}
      <Footer />
    </div>
  )
}

// Export the layout so App.jsx and AdminLayout can use it.
export default CustomerLayout