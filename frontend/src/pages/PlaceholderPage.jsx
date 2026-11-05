// This page is reused for features that are not implemented yet.
// Different routes provide different titles and descriptions.
function PlaceholderPage({ title, description }) {
  return (
    // The container controls page width.
    // page-section provides consistent vertical spacing.
    <section className="container page-section">
      <h1>{title}</h1>

      <p className="page-introduction">
        {description}
      </p>

      {/* Explain that this route currently demonstrates navigation,
          rather than a completed feature. */}
      <p>
        This page is a navigation preview. Its functionality
        will be added in a later sprint.
      </p>
    </section>
  )
}

// Export the component so App.jsx can reuse it for several routes.
export default PlaceholderPage