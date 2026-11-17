/*
 * FILE: frontend/src/components/DemoTicketQR.jsx
 *
 * PURPOSE
 * -------
 * Generates and displays a downloadable demo ticket QR.
 *
 * USED BY
 * -------
 * - Booking Confirmation.
 * - Booking History.
 *
 * IMPORTANT
 * ---------
 * This QR contains a booking reference only.
 *
 * It does not:
 * - Authenticate a customer.
 * - Grant access to booking information.
 * - Validate admission to a cinema.
 *
 * The project uses simulated purchases, so the QR remains
 * explicitly labelled as a demo ticket in both data modes.
 *
 * DEPENDENCY
 * ----------
 * Uses the existing "qrcode" package already in your project.
 * No additional package installation is required.
 */

import { useEffect, useState } from "react";

import QRCode from "qrcode";

/*
 * PROPS
 *
 * reference:
 * Booking reference returned by the booking service.
 *
 * disabled:
 * Set true for cancelled bookings/screenings.
 * Prevents QR generation and download.
 */
function DemoTicketQR({ reference, disabled = false }) {
  /*
   * Store the reference alongside its generated image.
   *
   * If the reference changes, an older QR must not appear
   * as the new booking's ticket.
   */
  const [result, setResult] = useState(null);

  const validReference =
    typeof reference === "string" && reference.trim() !== "";

  /*
   * GENERATE THE QR ASYNCHRONOUSLY
   *
   * The active flag prevents an obsolete request from updating
   * this component after its props change or it unmounts.
   */
  useEffect(() => {
    if (disabled || typeof reference !== "string" || reference.trim() === "") {
      return;
    }

    let active = true;

    const content = `RIO THEATERS DEMO TICKET\n${reference}`;

    QRCode.toDataURL(content, {
      type: "image/png",
      width: 640,
      margin: 4,
      errorCorrectionLevel: "M",

      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (active) {
          setResult({
            reference,
            url,
            error: false,
          });
        }
      })
      .catch(() => {
        if (active) {
          setResult({
            reference,
            url: null,
            error: true,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [reference, disabled]);

  /*
   * CANCELLED BOOKING / SCREENING
   *
   * Never display a previously generated QR while disabled.
   */
  if (disabled) {
    return (
      <p className="customer-ticket-note">
        QR download is unavailable for cancelled bookings or screenings.
      </p>
    );
  }

  /*
   * MISSING REFERENCE
   */
  if (!validReference) {
    return (
      <p className="customer-ticket-note" role="alert">
        A QR ticket cannot be generated without a booking reference.
      </p>
    );
  }

  /*
   * Only display a result belonging to the current reference.
   */
  const currentResult = result?.reference === reference ? result : null;

  /*
   * SAFE DOWNLOAD NAME
   *
   * Keep unexpected characters out of the filename.
   * This does not modify the actual reference encoded in the QR.
   */
  const safeFilename = reference.replace(/[^a-zA-Z0-9_-]/g, "-");

  return (
    <section
      className="customer-ticket-qr"
      aria-label={`Demo QR ticket for ${reference}`}
    >
      <div className="customer-ticket-qr-image">
        {currentResult?.url ? (
          <img
            src={currentResult.url}
            alt={`Demo ticket QR for booking ${reference}`}
            width={200}
            height={200}
          />
        ) : currentResult?.error ? (
          <p role="alert">
            The QR could not be generated. Keep your booking reference instead.
          </p>
        ) : (
          <p role="status">Generating QR code…</p>
        )}
      </div>

      <div className="customer-ticket-qr-information">
        <h3>Your demo QR ticket</h3>

        <p className="customer-ticket-qr-reference">{reference}</p>

        <p className="customer-ticket-note">
          One QR covers all seats in this booking.
        </p>

        <p className="customer-ticket-note">
          Demo ticket — not validated for cinema admission.
        </p>

        {currentResult?.url && (
          <a
            className="customer-ticket-download"
            href={currentResult.url}
            download={`rio-demo-ticket-${safeFilename}.png`}
          >
            Download QR
            <span aria-hidden="true">↓</span>
          </a>
        )}
      </div>
    </section>
  );
}

export default DemoTicketQR;
