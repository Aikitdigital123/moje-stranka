document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("fade-in");

    // Reset loaderu po načtení stránky
    setTimeout(resetLoaders, 300);

    const links = document.querySelectorAll("a");

    links.forEach(link => {
        link.addEventListener("click", (event) => {
            if (link.getAttribute("href").startsWith("#")) {
                return;
            }

            event.preventDefault();
            const targetUrl = link.href;

            document.body.classList.remove("fade-in");
            document.body.classList.add("fade-out");

            setTimeout(() => {
                window.location.href = targetUrl;
            }, 300);
        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const loader = document.getElementById('page-loader');

    if (loader) {
        // Zobrazíme loader
        loader.classList.add('active');

        // Trik pro restartování animace - odstraníme a znovu přidáme třídu
        setTimeout(() => {
            loader.classList.remove('loader');
            void loader.offsetWidth;  // nutné pro restart animace
            loader.classList.add('loader');
        }, 50);
    }
});




