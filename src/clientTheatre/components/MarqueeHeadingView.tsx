import "@clientTheatre/styles/MarqueeHeading.css";
function MarqueeHeadingView(): React.JSX.Element {
    return (
        <header className="marquee-heading">
            <h1 className="marquee-title">The Universal WASM Platform</h1>
            <p className="marquee-subtitle">Seventeen Languages, One Terminal</p>
        </header>
    );
}
export { MarqueeHeadingView };
