import Header from "../components/Header";
import Footer from "../components/Footer";

function CustomerLayout({ headerProps, onLogoClick, children }) {
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <Header {...headerProps} onLogoClick={onLogoClick} />

      <main id="main-content" tabIndex={-1}>
        {children}
      </main>

      <Footer onLogoClick={onLogoClick} />
    </div>
  );
}

export default CustomerLayout;
