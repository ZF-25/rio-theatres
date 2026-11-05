import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <section aria-labelledby="not-found-title">
      <h2 id="not-found-title">Page not found</h2>

      <p>The page you requested does not exist.</p>

      <Link to="/">Back to home</Link>
    </section>
  )
}

export default NotFound