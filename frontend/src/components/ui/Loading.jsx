// Loading displays a shared loading indicator and message.
// It uses the .ui-loading styles already defined in App.css.
//
// Example:
// <Loading />
//
// Or provide a more specific message:
// <Loading message="Connecting to the backend…" />

function Loading({
  message = 'Loading…',
  className = '',
}) {
  // Combine the shared styles with any additional classes
  // supplied by the page using this component.
  const loadingClasses = [
    'ui-loading',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    // role="status" helps screen readers announce the message
    // without interrupting what the user is currently hearing.
    //
    // aria-atomic="true" asks assistive technology to announce
    // the whole message when its content changes.
    <div
      className={loadingClasses}
      role="status"
      aria-atomic="true"
    >
      {/* The spinner is decorative because the adjacent text
          already explains that something is loading.
          
          aria-hidden prevents screen readers from announcing it.
          CSS disables its animation when reduced motion is requested. */}
      <span
        className="ui-loading-indicator"
        aria-hidden="true"
      />

      {/* Always include text so loading is communicated through
          more than just movement or colour. */}
      <span>{message}</span>
    </div>
  )
}

// Export Loading for use while waiting for API responses
// or other asynchronous operations.
export default Loading