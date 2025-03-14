document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("fade-in");

    // ✅ Reset loaderu
    function resetLoaders() {
        console.log("Loader resetován"); // Pro testování
        // Přidej další akce podle potřeby
    }
    setTimeout(resetLoaders, 300);

    // ✅ Najdeme všechny odkazy
    const links = document.querySelectorAll("a");

    links.forEach(link => {
        link.addEventListener("click", (event) => {
            if (link.getAttribute("href").startsWith("#")) {
                return; // Ignoruj interní odkazy
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

    // ✅ Přidání loaderu (původní kód)
    const loader = document.getElementById("page-loader");
    if (loader) {
        loader.classList.add("active");

        setTimeout(() => {
            loader.classList.remove("loader");
            void loader.offsetWidth; // Nutné pro restart animace
            loader.classList.add("loader");
        }, 50);
    }
});


document.addEventListener("DOMContentLoaded", () => {
    const images = document.querySelectorAll(".service-image.zoomable");
    const largeImage = document.getElementById("large-image");
    let currentIndex = 0;

    // Dynamicky přidáme tabindex pro možnost ovládání klávesnicí
    images.forEach((img, index) => {
        img.setAttribute("tabindex", "0"); 
        img.dataset.index = index; 

        // Kliknutím zvětšíme obrázek
        img.addEventListener("click", () => {
            toggleZoom(img);
        });

        // Klávesová navigace
        img.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleZoom(img);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                navigateImages(1);
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                navigateImages(-1);
            }
        });

        // Najetí myší změní obrázek a zvýrazní
        img.addEventListener("mouseover", () => {
            updateLargeImage(img);
            img.classList.add("hovered");
        });

        // Opustit myší vrátí původní obrázek
        img.addEventListener("mouseleave", () => {
            resetLargeImage();
            img.classList.remove("hovered");
        });

        // Zaměření klávesnicí (`Tab`) změní obrázek a zvýrazní
        img.addEventListener("focus", () => {
            updateLargeImage(img);
            img.classList.add("focused");
        });

        // Opuštění klávesnicí (`Tab` dál) vrátí obrázek do původního stavu
        img.addEventListener("blur", () => {
            resetLargeImage();
            img.classList.remove("focused");
        });
    });
    /* Zvětšení a zmenšení obrázku*/
    function toggleZoom(img) {
        if (img.classList.contains("zoomed")) {
            img.classList.remove("zoomed");
        } else {
            document.querySelectorAll(".zoomed").forEach(zoomedImg => zoomedImg.classList.remove("zoomed"));
            img.classList.add("zoomed");
        }
    }
    /*Navigace mezi obrázky pomocí šipek*/
    function navigateImages(direction) {
        currentIndex += direction;
        if (currentIndex < 0) currentIndex = images.length - 1;
        if (currentIndex >= images.length) currentIndex = 0;

        images[currentIndex].focus(); // Přesun fokusu na nový obrázek
    }
    /*Změna velkého obrázku při najetí myší*/
    function updateLargeImage(img) {
        if (largeImage) {
            largeImage.src = img.getAttribute("data-large");
            largeImage.alt = img.alt; 
        }
    }
    /*Vrácení původního obrázku*/
    function resetLargeImage() {
        if (largeImage) {
            largeImage.src = "puvodni-obrazek.jpg"; 
            largeImage.alt = "Velký obrázek";
        }
    }
  

    // Kliknutí mimo zavře zvětšení
    document.addEventListener("click", (event) => {
        if (!event.target.classList.contains("zoomable")) {
            document.querySelectorAll(".zoomed").forEach(img => img.classList.remove("zoomed"));
        }
    });

    // Posluchač pro `onload`
    window.addEventListener("load", () => {
        console.log("Stránka plně načtena – připraveno k interakci.");
    });
});





