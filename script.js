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

function resetLoaders() {
    const loader = document.querySelector('.loader-custom');
    if (loader) {
        loader.classList.remove('loader-custom');

        setTimeout(() => {
            loader.classList.add('loader-custom');
        }, 50);
    }
}


