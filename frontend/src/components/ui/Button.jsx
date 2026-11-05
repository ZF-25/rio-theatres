// A reusable button keeps styling and default behaviour consistent.
// It renders a normal HTML button using the styles in App.css.
function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
  ...props
}) {
  // children is the content between <Button> and </Button>.
  //
  // variant selects the primary or secondary appearance.
  //
  // type defaults to "button" to avoid accidental form submissions.
  // Forms should explicitly pass type="submit".
  //
  // disabled prevents interaction when an action is unavailable.
  //
  // className allows additional page-specific styles.
  //
  // props contains remaining attributes, such as onClick and aria-label.

  // Use primary styling unless secondary was explicitly requested.
  const buttonVariant =
    variant === 'secondary' ? 'secondary' : 'primary'

  // Combine the shared class, appearance, and optional extra classes.
  // filter(Boolean) removes empty values; join creates one string.
  const buttonClasses = [
    'ui-button',
    `ui-button--${buttonVariant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      // Forward additional attributes to the actual HTML button.
      {...props}
      // Apply the settings controlled by this component.
      type={type}
      className={buttonClasses}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

// A default export allows other files to import it like this:
// import Button from './Button.jsx'
export default Button