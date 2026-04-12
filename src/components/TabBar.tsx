interface Props {
  page: string;
  setPage: (page: "main" | "settings" | "about") => void;
}

export default function TabBar({ page, setPage }: Props) {
  return (
    <div className="tab-bar">
      <button
        className={`tab ${page === "main" ? "active" : ""}`}
        onClick={() => setPage("main")}
      >
        Home
      </button>
      <button
        className={`tab ${page === "settings" ? "active" : ""}`}
        onClick={() => setPage("settings")}
      >
        Settings
      </button>
      <button
        className={`tab ${page === "about" ? "active" : ""}`}
        onClick={() => setPage("about")}
      >
        About
      </button>
    </div>
  );
}
