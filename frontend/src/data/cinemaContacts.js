/*
 * FILE: frontend/src/data/cinemaContacts.js
 *
 * Stores contact and location information for Rio Theaters
 * when the application is running in demo mode.
 *
 * This information is displayed on the Home page in:
 * - The cinema location selector.
 * - Cinema location cards.
 * - The contact information section.
 *
 * Each cinema has its own address, phone number,
 * email address, and opening hours.
 *
 * Room information is stored separately in cinema.js
 * to avoid repeating the same room definitions.
 *
 * IMPORTANT:
 * The addresses and phone numbers are provided client details.
 * Email addresses and opening hours are example values
 * and must be confirmed before the website goes live.
 *
 * In API mode, cinema information is loaded from the backend
 * using GET /api/v1/cinemas instead of this file.
 */


/*
 * CINEMA CONTACTS
 *
 * An array containing the contact details of each cinema.
 *
 * Each object represents one Rio Theaters location.
 *
 * Properties:
 * city: Name of the city where the cinema is located.
 * address: Street address of the cinema.
 * phone: Cinema contact phone number.
 * email: Cinema contact email address.
 * hours: Array containing opening hours for each day or day group.
 *
 * The city names must match those used by the demo cinema store
 * so the correct information is shown for each location.
 */
export const cinemaContacts = [
  /*
   * OULU CINEMA
   *
   * Contact information for the Oulu location.
   *
   * Address and phone number are provided client details.
   * Email and opening hours are demo examples.
   */
  {
    // Must match the city name used by the existing demo store.
    city: "Oulu",

    // Cinema street address and postal code.
    address: "Kauppurienkatu 45, 90100 Oulu, Finland",

    // Cinema contact phone number.
    phone: "+358 8 5542 3890",

    /*
     * EXAMPLE EMAIL
     *
     * Uses the reserved .example domain.
     * This is not a working customer service email address.
     *
     * Replace it with the client's confirmed email
     * before the website is publicly deployed.
     */
    email: "oulu@rio-theaters.example",

    /*
     * OPENING HOURS
     *
     * An array of strings showing the cinema's
     * example opening hours in Finnish local time.
     *
     * Each string represents a day or group of days.
     *
     * These values are displayed to customers only.
     * They do not control or validate screening times.
     *
     * Replace them with confirmed opening hours
     * before the website goes live.
     */
    hours: [
      "Mon–Thu 14:00–22:00",
      "Fri 14:00–00:00",
      "Sat 11:00–00:00",
      "Sun 11:00–22:00",
    ],
  },

  /*
   * TAMPERE CINEMA
   *
   * Contact information for the Tampere location.
   *
   * Uses the same object structure as the Oulu cinema
   * so the application can display both locations
   * using the same components.
   *
   * Address and phone number are provided client details.
   * Email and opening hours are demo examples.
   */
  {
    // Must match the city name used by the existing demo store.
    city: "Tampere",

    // Cinema street address and postal code.
    address: "Hämeenkatu 27, 33100 Tampere, Finland",

    // Cinema contact phone number.
    phone: "+358 2 2641 7520",

    /*
     * EXAMPLE EMAIL
     *
     * Uses the reserved .example domain.
     * Replace it with a real, client-approved email address.
     */
    email: "tampere@rio-theaters.example",

    /*
     * OPENING HOURS
     *
     * Example opening hours for the Tampere cinema.
     *
     * Times are displayed in Finnish local time.
     * These values are for display purposes only
     * and do not restrict the screening schedule.
     */
    hours: [
      "Mon–Thu 13:00–22:00",
      "Fri 13:00–00:00",
      "Sat 10:00–00:00",
      "Sun 10:00–22:00",
    ],
  },
];