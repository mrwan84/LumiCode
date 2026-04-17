export default function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-icon">
        <div className="about-ring">
          <div className="about-dot" />
        </div>
      </div>
      <h2 className="about-title">LumiCode</h2>
      <p className="about-desc">Claude Code RGB Notifier</p>
      <div className="about-divider" />
      <div className="about-info">
        <div className="about-row">
          <span className="about-label">Author</span>
          <span className="about-value">M.Alsouki</span>
        </div>
        <div className="about-row">
          <span className="about-label">Version</span>
          <span className="about-value">1.5.1</span>
        </div>
        <div className="about-row">
          <span className="about-label">License</span>
          <span className="about-value">MIT</span>
        </div>
      </div>
    </div>
  );
}
