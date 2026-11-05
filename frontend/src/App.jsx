// Routes selects the route matching the current URL.
// Route defines a URL and the component to display there.
import { Route, Routes } from "react-router-dom";

// Layouts provide the shared header, main content area, and footer.
import CustomerLayout from "./layouts/CustomerLayout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";

// Existing setup pages remain available.
import Home from "./pages/Home.jsx";
import Setup from "./pages/Setup.jsx";
import NotFound from "./pages/NotFound.jsx";

// Reuse one placeholder component for unfinished features.
import PlaceholderPage from "./pages/PlaceholderPage.jsx";

// Import the shared application styles.
import "./App.css";

function App() {
  return (
    <Routes>
      {/* Customer pages share the customer header and footer.
          Each matching page renders inside the layout's Outlet. */}
      <Route element={<CustomerLayout />}>
        {/* An index route matches the parent's URL: "/". */}
        <Route index element={<Home />} />

        {/* Keep the setup page from Issue #1 accessible. */}
        <Route path="setup" element={<Setup />} />

        <Route
          path="movies"
          element={
            <PlaceholderPage
              title="Movies"
              description="Explore movies showing at Rio Theaters."
            />
          }
        />

        <Route
          path="locations"
          element={
            <PlaceholderPage
              title="Our cinemas"
              description="Find Rio Theaters in Oulu and Tampere."
            />
          }
        />

        <Route
          path="contact"
          element={
            <PlaceholderPage
              title="Contact us"
              description="Get in touch with the Rio Theaters team."
            />
          }
        />

        <Route
          path="about"
          element={
            <PlaceholderPage
              title="About Rio Theaters"
              description="Learn about our cinemas and the movie experience."
            />
          }
        />

        <Route
          path="my-bookings"
          element={
            <PlaceholderPage
              title="Your bookings"
              description="Your ticket purchases will appear here once customer accounts and bookings are implemented."
            />
          }
        />

        <Route
          path="login"
          element={
            <PlaceholderPage
              title="Log in"
              description="Customer login will be implemented in a later sprint."
            />
          }
        />

        {/* The wildcard displays a fallback for unknown customer URLs. */}
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Admin pages use a separate navigation through AdminLayout.
          Nested paths are added to "/admin".
          For example, "screenings" becomes "/admin/screenings".
          
          These are public layout previews for Issue #2.
          Authentication and authorization are not implemented yet. */}
      <Route path="admin" element={<AdminLayout />}>
        <Route
          index
          element={
            <PlaceholderPage
              title="Cinema overview"
              description="Administrator dashboard layout preview."
            />
          }
        />

        <Route
          path="screenings"
          element={
            <PlaceholderPage
              title="Manage screenings"
              description="Screening management will be implemented in a later sprint."
            />
          }
        />

        <Route
          path="bookings"
          element={
            <PlaceholderPage
              title="Manage bookings"
              description="Booking management will be implemented in a later sprint."
            />
          }
        />

        <Route
          path="seats"
          element={
            <PlaceholderPage
              title="Seat availability"
              description="Seat availability and reservation tools will be added later."
            />
          }
        />

        <Route
          path="cashiers"
          element={
            <PlaceholderPage
              title="Cashier accounts"
              description="Owner account management tools will be added in a later sprint."
            />
          }
        />

        {/* Unknown admin URLs keep the administrator layout. */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// main.jsx renders App inside BrowserRouter.
// Do not add another BrowserRouter here.
export default App;
