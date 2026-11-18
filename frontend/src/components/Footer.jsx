import logo from '../assets/rio-theaters-logo.png'

function Footer({ onLogoClick }) {
  return (
    <footer className="site-footer">
      <div className="container footer-content">
        <a
          href="#home"
          aria-label="Rio Theaters home"
          onClick={onLogoClick}
        >
          <img
            className="footer-logo"
            src={logo}
            alt="Rio Theaters"
            loading="lazy"
          />
        </a>

        <p>© {new Date().getFullYear()} Rio Theaters</p>
      </div>
    </footer>
  )
}

export default Footer