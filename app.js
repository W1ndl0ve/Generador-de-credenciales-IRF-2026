(() => {
    "use strict";

    const $ = selector => document.querySelector(selector);
    const elements = {
        form: $("#credential-form"),
        name: $("#name"),
        region: $("#region"),
        photoInput: $("#photo"),
        nameCount: $("#name-count"),
        previewName: $("#preview-name"),
        previewRegion: $("#preview-region"),
        portrait: $("#portrait"),
        portraitImage: $("#portrait-image"),
        portraitPlaceholder: $("#portrait-placeholder"),
        upload: $("#upload"),
        uploadTitle: $("#upload-title"),
        uploadHelp: $("#upload-help"),
        controls: $("#photo-controls"),
        zoom: $("#zoom"),
        centerPhoto: $("#center-photo"),
        download: $("#download"),
        share: $("#share"),
        reset: $("#reset"),
        completion: $("#completion"),
        nameError: $("#name-error"),
        regionError: $("#region-error"),
        photoError: $("#photo-error"),
        toast: $("#toast"),
        toastTitle: $("#toast-title"),
        toastMessage: $("#toast-message")
    };

    const state = {
        photoUrl: "",
        photoFile: null,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        dragging: false,
        pointerX: 0,
        pointerY: 0,
        originX: 0,
        originY: 0,
        toastTimer: null,
        busy: false
    };

    const assets = {
        background: loadAsset("Fondo.jpg"),
        wordmark: loadAsset("irf-wordmark.png")
    };

    function loadAsset(source) {
        const image = new Image();
        image.decoding = "async";
        image.src = source;
        return image;
    }

    function waitForImage(image) {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve(image);
        return new Promise((resolve, reject) => {
            image.addEventListener("load", () => resolve(image), { once: true });
            image.addEventListener("error", () => reject(new Error("No se pudo cargar un recurso visual.")), { once: true });
        });
    }

    function cleanText(value) {
        return value.trim().replace(/\s+/g, " ");
    }

    function setError(field, message) {
        const map = {
            name: [elements.name, elements.nameError],
            region: [elements.region, elements.regionError],
            photo: [elements.upload, elements.photoError]
        };
        const [control, error] = map[field];
        control.classList.toggle("has-error", Boolean(message));
        error.textContent = message;
    }

    function updateTextPreview() {
        const name = cleanText(elements.name.value);
        const region = elements.region.value;
        elements.previewName.textContent = name || "Nombre Apellido";
        elements.previewRegion.textContent = region || "tu región";
        elements.nameCount.textContent = elements.name.value.length;
        if (name) setError("name", "");
        if (region) setError("region", "");
        updateCompletion();
    }

    function updateCompletion() {
        const completed = [cleanText(elements.name.value), elements.region.value, state.photoFile].filter(Boolean).length;
        elements.completion.textContent = `${completed} de 3`;
        elements.completion.style.color = completed === 3 ? "#ffc725" : "";
        elements.completion.style.borderColor = completed === 3 ? "rgba(255,199,37,.28)" : "";
    }

    function validateForm() {
        const name = cleanText(elements.name.value);
        const region = elements.region.value;
        let valid = true;

        if (name.length < 2) {
            setError("name", "Escribe tu nombre y apellido.");
            valid = false;
        } else {
            setError("name", "");
        }

        if (!region) {
            setError("region", "Selecciona la región que representas.");
            valid = false;
        } else {
            setError("region", "");
        }

        if (!state.photoFile || !elements.portraitImage.naturalWidth) {
            setError("photo", "Sube una fotografía para completar la credencial.");
            valid = false;
        } else {
            setError("photo", "");
        }

        if (!valid) {
            const firstInvalid = elements.form.querySelector(".has-error");
            firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
            if (firstInvalid instanceof HTMLInputElement || firstInvalid instanceof HTMLSelectElement) firstInvalid.focus({ preventScroll: true });
        }
        return valid;
    }

    function imageCoverSize(image, boxSize, zoom = 1) {
        const ratio = image.naturalWidth / image.naturalHeight;
        let width = boxSize;
        let height = boxSize;
        if (ratio > 1) width = boxSize * ratio;
        if (ratio < 1) height = boxSize / ratio;
        return { width: width * zoom, height: height * zoom };
    }

    function clampPhotoPosition() {
        if (!elements.portraitImage.naturalWidth) return;
        const size = elements.portrait.clientWidth;
        const rendered = imageCoverSize(elements.portraitImage, size, state.zoom);
        const maxX = Math.max(0, (rendered.width - size) / 2);
        const maxY = Math.max(0, (rendered.height - size) / 2);
        state.offsetX = Math.max(-maxX, Math.min(maxX, state.offsetX));
        state.offsetY = Math.max(-maxY, Math.min(maxY, state.offsetY));
    }

    function applyPhotoTransform() {
        clampPhotoPosition();
        elements.portraitImage.style.transform = `translate(calc(-50% + ${state.offsetX}px), calc(-50% + ${state.offsetY}px)) scale(${state.zoom})`;
    }

    function centerPhoto() {
        state.zoom = 1;
        state.offsetX = 0;
        state.offsetY = 0;
        elements.zoom.value = "1";
        applyPhotoTransform();
    }

    function fileSizeLabel(bytes) {
        return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function loadPhoto(file) {
        setError("photo", "");
        if (!file) return;

        const accepted = ["image/jpeg", "image/png", "image/webp"];
        if (!accepted.includes(file.type)) {
            setError("photo", "Elige una imagen JPG, PNG o WEBP.");
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            setError("photo", "La imagen supera los 15 MB. Elige una más ligera.");
            return;
        }

        const nextUrl = URL.createObjectURL(file);
        const probe = new Image();
        probe.onload = () => {
            if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
            state.photoUrl = nextUrl;
            state.photoFile = file;
            elements.portraitImage.onload = () => {
                centerPhoto();
                elements.portraitImage.hidden = false;
                elements.portraitPlaceholder.hidden = true;
                elements.controls.hidden = false;
                elements.uploadTitle.textContent = file.name;
                elements.uploadHelp.textContent = `${fileSizeLabel(file.size)} · Lista para usar`;
                updateCompletion();
            };
            elements.portraitImage.src = nextUrl;
        };
        probe.onerror = () => {
            URL.revokeObjectURL(nextUrl);
            setError("photo", "No pudimos leer esa imagen. Prueba con otra.");
        };
        probe.src = nextUrl;
    }

    function roundedRect(context, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.moveTo(x + r, y);
        context.arcTo(x + width, y, x + width, y + height, r);
        context.arcTo(x + width, y + height, x, y + height, r);
        context.arcTo(x, y + height, x, y, r);
        context.arcTo(x, y, x + width, y, r);
        context.closePath();
    }

    function drawImageCover(context, image, x, y, width, height) {
        const sourceRatio = image.naturalWidth / image.naturalHeight;
        const targetRatio = width / height;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = image.naturalWidth;
        let sourceHeight = image.naturalHeight;
        if (sourceRatio > targetRatio) {
            sourceWidth = image.naturalHeight * targetRatio;
            sourceX = (image.naturalWidth - sourceWidth) / 2;
        } else {
            sourceHeight = image.naturalWidth / targetRatio;
            sourceY = (image.naturalHeight - sourceHeight) / 2;
        }
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    }

    function drawFittedText(context, text, x, y, maxWidth, initialSize, weight) {
        let size = initialSize;
        do {
            context.font = `${weight} ${size}px Montserrat, Arial, sans-serif`;
            if (context.measureText(text).width <= maxWidth) break;
            size -= 2;
        } while (size > 34);
        context.fillText(text, x, y);
    }

    function drawCanvasPhoto(context) {
        const image = elements.portraitImage;
        const size = 420;
        const rendered = imageCoverSize(image, size, state.zoom);
        const previewSize = elements.portrait.clientWidth;
        const factor = size / previewSize;
        const x = 600 - rendered.width / 2 + state.offsetX * factor;
        const y = 531 - rendered.height / 2 + state.offsetY * factor;

        context.save();
        context.beginPath();
        context.arc(600, 531, 210, 0, Math.PI * 2);
        context.clip();
        context.drawImage(image, x, y, rendered.width, rendered.height);
        context.restore();
    }

    async function renderCredential() {
        await Promise.all([
            waitForImage(assets.background),
            waitForImage(assets.wordmark),
            waitForImage(elements.portraitImage),
            document.fonts?.ready || Promise.resolve()
        ]);

        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 1200;
        const context = canvas.getContext("2d", { alpha: false });
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        drawImageCover(context, assets.background, 0, 0, 1200, 1200);

        const shade = context.createLinearGradient(0, 0, 0, 1200);
        shade.addColorStop(0, "rgba(5,5,5,.72)");
        shade.addColorStop(.42, "rgba(5,5,5,.35)");
        shade.addColorStop(.86, "rgba(5,5,5,.96)");
        shade.addColorStop(1, "rgba(5,5,5,.99)");
        context.fillStyle = shade;
        context.fillRect(0, 0, 1200, 1200);

        const glow = context.createRadialGradient(600, 370, 30, 600, 370, 470);
        glow.addColorStop(0, "rgba(255,167,38,.2)");
        glow.addColorStop(1, "rgba(255,167,38,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, 1200, 800);

        context.save();
        context.globalAlpha = .055;
        context.strokeStyle = "#ffffff";
        context.lineWidth = 1;
        for (let line = 100; line < 1200; line += 100) {
            context.beginPath();
            context.moveTo(line, 0);
            context.lineTo(line, 660);
            context.stroke();
            context.beginPath();
            context.moveTo(0, line);
            context.lineTo(1200, line);
            context.stroke();
        }
        context.restore();

        const accent = context.createLinearGradient(0, 0, 410, 0);
        accent.addColorStop(0, "#ffa726");
        accent.addColorStop(1, "#ffc725");
        context.fillStyle = accent;
        context.fillRect(0, 0, 408, 7);

        context.drawImage(assets.wordmark, 72, 66, 384, 108);

        roundedRect(context, 862, 78, 266, 54, 27);
        context.fillStyle = "rgba(10,10,10,.55)";
        context.fill();
        context.strokeStyle = "rgba(255,199,37,.38)";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = "#f4d96e";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "800 19px Montserrat, Arial, sans-serif";
        context.fillText("BECARIO/A · 2026", 995, 106);

        context.font = "600 26px Montserrat, Arial, sans-serif";
        context.fillStyle = "#dedee2";
        const message = "EMPIEZA MI VIAJE EN EL ";
        const suffix = "IRF'26";
        context.font = "600 26px Montserrat, Arial, sans-serif";
        const messageWidth = context.measureText(message).width;
        context.font = "900 26px Montserrat, Arial, sans-serif";
        const suffixWidth = context.measureText(suffix).width;
        let messageX = 600 - (messageWidth + suffixWidth) / 2;
        context.textAlign = "left";
        context.font = "600 26px Montserrat, Arial, sans-serif";
        context.fillStyle = "#dedee2";
        context.fillText(message, messageX, 230);
        context.font = "900 26px Montserrat, Arial, sans-serif";
        context.fillStyle = "#ffc725";
        context.fillText(suffix, messageX + messageWidth, 230);

        context.save();
        context.shadowColor = "rgba(255,167,38,.35)";
        context.shadowBlur = 42;
        context.beginPath();
        context.arc(600, 531, 231, 0, Math.PI * 2);
        context.fillStyle = accent;
        context.fill();
        context.restore();
        context.beginPath();
        context.arc(600, 531, 218, 0, Math.PI * 2);
        context.fillStyle = "#0b0b0b";
        context.fill();
        drawCanvasPhoto(context);

        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#ffc725";
        context.font = "800 19px Montserrat, Arial, sans-serif";
        context.fillText("TALENTO REGIONAL", 600, 818);

        context.fillStyle = "#ffffff";
        drawFittedText(context, cleanText(elements.name.value), 600, 868, 1040, 68, 900);

        const prefix = "Representando a ";
        const region = elements.region.value;
        context.font = "400 27px Montserrat, Arial, sans-serif";
        const prefixWidth = context.measureText(prefix).width;
        context.font = "700 27px Montserrat, Arial, sans-serif";
        const regionWidth = context.measureText(region).width;
        const regionStart = 600 - (prefixWidth + regionWidth) / 2;
        context.textAlign = "left";
        context.fillStyle = "#d1d1d5";
        context.font = "400 27px Montserrat, Arial, sans-serif";
        context.fillText(prefix, regionStart, 928);
        context.fillStyle = "#ffffff";
        context.font = "700 27px Montserrat, Arial, sans-serif";
        context.fillText(region, regionStart + prefixWidth, 928);

        const tag = "#ElTalentoNaceEnLasRegiones";
        context.font = "600 18px Montserrat, Arial, sans-serif";
        const tagWidth = context.measureText(tag).width + 76;
        roundedRect(context, 600 - tagWidth / 2, 974, tagWidth, 52, 26);
        context.fillStyle = "rgba(255,255,255,.06)";
        context.fill();
        context.strokeStyle = "rgba(255,255,255,.16)";
        context.lineWidth = 2;
        context.stroke();
        context.beginPath();
        context.arc(600 - tagWidth / 2 + 27, 1000, 5, 0, Math.PI * 2);
        context.fillStyle = "#ffc725";
        context.fill();
        context.textAlign = "left";
        context.fillStyle = "#d1d1d5";
        context.fillText(tag, 600 - tagWidth / 2 + 46, 1000);

        context.strokeStyle = "rgba(255,255,255,.13)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(60, 1100);
        context.lineTo(1140, 1100);
        context.stroke();
        context.fillStyle = "#73737c";
        context.font = "700 14px Montserrat, Arial, sans-serif";
        context.textBaseline = "alphabetic";
        context.textAlign = "left";
        context.fillText("IMPACT REGIONAL FELLOWSHIP", 60, 1148);
        context.textAlign = "right";
        context.fillText("SPINOUT · PERÚ", 1140, 1148);

        return canvas;
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo crear el archivo.")), "image/png");
        });
    }

    function safeFileName() {
        return cleanText(elements.name.value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "becario";
    }

    function setBusy(busy, action = "download") {
        state.busy = busy;
        elements.download.disabled = busy;
        elements.share.disabled = busy;
        const label = elements.download.querySelector("span");
        label.textContent = busy && action === "download" ? "Generando imagen…" : "Descargar credencial";
    }

    function showToast(title, message) {
        window.clearTimeout(state.toastTimer);
        elements.toastTitle.textContent = title;
        elements.toastMessage.textContent = message;
        elements.toast.classList.add("is-visible");
        state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3600);
    }

    async function makeFile() {
        const canvas = await renderCredential();
        const blob = await canvasToBlob(canvas);
        return new File([blob], `IRF2026-${safeFileName()}.png`, { type: "image/png" });
    }

    async function downloadCredential() {
        if (state.busy || !validateForm()) return;
        setBusy(true, "download");
        try {
            const file = await makeFile();
            const url = URL.createObjectURL(file);
            const link = document.createElement("a");
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
            showToast("¡Credencial lista!", "Se descargó en alta resolución y ya puedes compartirla.");
        } catch (error) {
            showToast("No pudimos descargarla", "Recarga la página e inténtalo nuevamente.");
        } finally {
            setBusy(false);
        }
    }

    async function shareCredential() {
        if (state.busy || !validateForm()) return;
        setBusy(true, "share");
        try {
            const file = await makeFile();
            if (!navigator.canShare?.({ files: [file] })) throw new Error("El dispositivo no permite compartir archivos.");
            await navigator.share({
                files: [file],
                title: "Mi credencial IRF 2026",
                text: `Soy parte de Impact Regional Fellowship 2026 representando a ${elements.region.value}. #ElTalentoNaceEnLasRegiones`
            });
            showToast("¡Lista para inspirar!", "Gracias por compartir el talento de tu región.");
        } catch (error) {
            if (error.name !== "AbortError") showToast("No se pudo compartir", "Puedes descargar la imagen y compartirla desde tu galería.");
        } finally {
            setBusy(false);
        }
    }

    function resetForm() {
        elements.form.reset();
        if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
        state.photoUrl = "";
        state.photoFile = null;
        state.zoom = 1;
        state.offsetX = 0;
        state.offsetY = 0;
        elements.portraitImage.removeAttribute("src");
        elements.portraitImage.hidden = true;
        elements.portraitPlaceholder.hidden = false;
        elements.controls.hidden = true;
        elements.uploadTitle.textContent = "Sube una foto clara";
        elements.uploadHelp.textContent = "JPG, PNG o WEBP · Máx. 15 MB";
        ["name", "region", "photo"].forEach(field => setError(field, ""));
        updateTextPreview();
        elements.name.focus();
    }

    elements.name.addEventListener("input", updateTextPreview);
    elements.region.addEventListener("change", updateTextPreview);
    elements.photoInput.addEventListener("change", event => loadPhoto(event.target.files[0]));
    elements.zoom.addEventListener("input", () => {
        state.zoom = Number(elements.zoom.value);
        applyPhotoTransform();
    });
    elements.centerPhoto.addEventListener("click", centerPhoto);
    elements.reset.addEventListener("click", resetForm);
    elements.form.addEventListener("submit", event => {
        event.preventDefault();
        downloadCredential();
    });
    elements.share.addEventListener("click", shareCredential);

    ["dragenter", "dragover"].forEach(type => elements.upload.addEventListener(type, event => {
        event.preventDefault();
        elements.upload.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach(type => elements.upload.addEventListener(type, event => {
        event.preventDefault();
        elements.upload.classList.remove("is-dragging");
    }));
    elements.upload.addEventListener("drop", event => loadPhoto(event.dataTransfer.files[0]));

    elements.portraitImage.addEventListener("pointerdown", event => {
        state.dragging = true;
        state.pointerX = event.clientX;
        state.pointerY = event.clientY;
        state.originX = state.offsetX;
        state.originY = state.offsetY;
        elements.portraitImage.setPointerCapture(event.pointerId);
    });
    elements.portraitImage.addEventListener("pointermove", event => {
        if (!state.dragging) return;
        state.offsetX = state.originX + event.clientX - state.pointerX;
        state.offsetY = state.originY + event.clientY - state.pointerY;
        applyPhotoTransform();
    });
    ["pointerup", "pointercancel"].forEach(type => elements.portraitImage.addEventListener(type, () => { state.dragging = false; }));

    window.addEventListener("resize", applyPhotoTransform, { passive: true });
    window.addEventListener("beforeunload", () => {
        if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    });

    if (typeof navigator.share === "function" && typeof File === "function") elements.share.hidden = false;
    updateTextPreview();
})();
