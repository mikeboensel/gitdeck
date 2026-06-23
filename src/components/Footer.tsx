import { SiGithub } from "react-icons/si";

const REPO_URL = "https://github.com/DenseContext/gitdeck";

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <a className="app-footer-link tip" data-tip="GitHub" aria-label="GitHub" href={REPO_URL} target="_blank" rel="noreferrer">
          <SiGithub size={16} />
        </a>
      </div>
    </footer>
  );
}
