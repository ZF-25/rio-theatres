// Reuse the existing layout structure instead of repeating
// its header, main content area, skip link, and footer.
import CustomerLayout from './CustomerLayout.jsx'

function AdminLayout() {
  return (
    // Select the administrator navigation.
    //
    // The Outlet inside CustomerLayout still displays the
    // matching nested admin page from App.jsx.
    <CustomerLayout variant="admin" />
  )
}

// This component controls the visual layout only.
// Authentication and administrator permissions will be
// implemented separately when we connect protected routes.
export default AdminLayout