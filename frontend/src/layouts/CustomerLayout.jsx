import { NavLink, Outlet } from 'react-router-dom'

function CustomerLayout() {
  return (
    <div className="app">
      <header className="header">
        <h1>Rio Theaters</h1>

        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Home
          </NavLink>

          {' | '}

          <NavLink to="/setup">
            Frontend setup
          </NavLink>
        </nav>
      </header>

      <main className="main" id="main-content">
        <Outlet />
      </main>
    </div>
  )
}

export default CustomerLayout