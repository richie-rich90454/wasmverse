import { useEffect, useState } from "react";
import "@clientTheatre/styles/MarqueeHeading.css";
function MarqueeHeadingView(): React.JSX.Element {
    const [healthText, setHealthText] = useState("Checking server.");
    const [healthOk, setHealthOk] = useState(true);
    useEffect(() => {
        let cancelled = false;
        fetch("/api/health")
            .then(async (response) => {
                if (cancelled) {
                    return;
                }
                if (!response.ok) {
                    setHealthOk(false);
                    setHealthText("Server unreachable.");
                    return;
                }
                const payload = (await response.json()) as {
                    registeredLanguages?: Array<string>;
                };
                const languageCount = payload.registeredLanguages?.length ?? 0;
                setHealthOk(true);
                setHealthText(
                    languageCount > 0
                        ? `Server healthy. ${languageCount} languages registered.`
                        : "Server healthy.",
                );
            })
            .catch(() => {
                if (!cancelled) {
                    setHealthOk(false);
                    setHealthText("Server unreachable.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return (
        <header className="marquee-heading">
            <h1 className="marquee-title">The Universal WASM Platform</h1>
            <p className="marquee-subtitle">
                Seventeen languages. One terminal. Compiled to WebAssembly.
            </p>
            <p
                className={`marquee-health ${healthOk ? "marquee-health-ok" : "marquee-health-err"}`}
                role="status"
            >
                {healthText}
            </p>
        </header>
    );
}
export { MarqueeHeadingView };
