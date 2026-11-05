// Card provides a shared visual container for related content.
//
// It uses the .ui-card styles already defined in App.css,
// including the background, border, spacing, and rounded corners.
//
// Example:
// <Card>
//   <h2>Our cinemas</h2>
//   <p>Visit us in Oulu and Tampere.</p>
// </Card>

function Card({
  children,
  className = '',
  ...props
}) {
  // children contains everything placed between <Card> and </Card>.
  // Each page supplies its own headings, text, buttons, or forms.
  //
  // className allows additional styles for a particular use.
  //
  // ...props collects other attributes, such as id or aria-labelledby,
  // which are passed to the underlying HTML element.

  const cardClasses = [
    'ui-card',
    className,
  ]
    // Remove empty values before creating the CSS class string.
    .filter(Boolean)
    .join(' ')

  return (
    // Use a neutral div because a card can hold many kinds of content.
    // The page using it decides which headings and semantic elements
    // are appropriate.
    <div
      {...props}
      className={cardClasses}
    >
      {children}
    </div>
  )
}

// Export Card so different pages can reuse the same container.
export default Card