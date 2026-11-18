/*
 * FILE: frontend/src/main.jsx
 *
 * Entry point for the Rio Theaters React application.
 *
 * Sets up React, routing, and shared authentication.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "./context/AuthProvider.jsx";

import App from "./App.jsx";
import "./index.css";

// Find the HTML element where React will render the application.
const rootElement = document.getElementById("root");

// Stop the application if the root element is missing.
if (!rootElement) {
  throw new Error("Missing root element.");
}

// Start React and wrap App with routing and authentication providers.
createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);