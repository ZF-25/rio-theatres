// Reuse our shared Button component for the optional retry action.
import Button from './Button.jsx'

// ErrorMessage displays an error consistently across pages.
//
// Basic example:
// <ErrorMessage message="Unable to load screenings." />
//
// With a retry action:
// <ErrorMessage
//   message="Unable to connect to the backend."
//   onRetry={loadData}
// />

function ErrorMessage({
  message = 'Something went wrong. Please try again.',
  onRetry,
  retryLabel = 'Try again',
  className = '',
}) {
  // Combine the shared error styles with any extra classes
  // supplied by the page using this component.
  const errorClasses = [
    'ui-error',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    // role="alert" helps screen readers announce the error
    // when this component appears after an operation fails.
    //
    // The message also explains the problem in text, so users
    // do not have to rely on the red error styling.
    <div
      className={errorClasses}
      role="alert"
    >
      <p>{message}</p>

      {/* Only display the retry button when a function is provided.
          Pass the function itself; do not call it during rendering.
          
          This component does not fetch data. The parent page
          decides what should happen when the user retries. */}
      {typeof onRetry === 'function' && (
        <Button
          variant="secondary"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

// Export the component so different pages can reuse it.
export default ErrorMessage