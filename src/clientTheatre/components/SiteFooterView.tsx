import "@clientTheatre/styles/SiteFooter.css";
function SiteFooterView(): React.JSX.Element {
    return (
        <footer className="site-footer">
            <span className="site-footer-mark">WASMVerse</span>
            <span className="site-footer-note">Twenty languages. One terminal.</span>
        </footer>
    );
}
export { SiteFooterView };
