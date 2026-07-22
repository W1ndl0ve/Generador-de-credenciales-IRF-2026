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
        reset: $("#reset"),
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
        background: loadAsset("base.jpg")
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

    function drawCanvasPhoto(context) {
        const image = elements.portraitImage;
        const size = 490;
        const rendered = imageCoverSize(image, size, state.zoom);
        const previewSize = elements.portrait.clientWidth;
        const factor = size / previewSize;
        const x = 600 - rendered.width / 2 + state.offsetX * factor;
        const y = 485 - rendered.height / 2 + state.offsetY * factor;

        context.save();
        context.beginPath();
        context.arc(600, 485, 245, 0, Math.PI * 2);
        context.clip();
        context.drawImage(image, x, y, rendered.width, rendered.height);
        context.restore();
    }

    async function renderCredential() {
        await Promise.all([
            waitForImage(assets.background),
            waitForImage(elements.portraitImage),
            document.fonts?.ready || Promise.resolve()
        ]);

        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 1200;
        const context = canvas.getContext("2d", { alpha: false });
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        context.drawImage(assets.background, 0, 0, 1200, 1200);

        roundedRect(context, 906, 54, 238, 50, 25);
        context.fillStyle = "rgba(10,10,10,.62)";
        context.fill();
        context.strokeStyle = "rgba(255,199,37,.38)";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = "#f4d96e";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "800 18px Montserrat, Arial, sans-serif";
        context.fillText("COHORTE · 2026", 1025, 79);

        drawCanvasPhoto(context);
        context.beginPath();
        context.arc(600, 485, 249, 0, Math.PI * 2);
        context.strokeStyle = "#ffc21f";
        context.lineWidth = 7;
        context.stroke();

        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#ffc725";
        let nameSize = 62;
        do {
            context.font = `700 ${nameSize}px Georgia, "Times New Roman", serif`;
            if (context.measureText(cleanText(elements.name.value)).width <= 1020) break;
            nameSize -= 2;
        } while (nameSize > 38);
        context.fillText(cleanText(elements.name.value), 600, 824);

        const prefix = "#El talento nace en ";
        const region = elements.region.value;
        context.font = "400 42px Georgia, 'Times New Roman', serif";
        const prefixWidth = context.measureText(prefix).width;
        context.font = "700 42px Georgia, 'Times New Roman', serif";
        const regionWidth = context.measureText(region).width;
        const regionStart = 600 - (prefixWidth + regionWidth) / 2;
        context.textAlign = "left";
        context.fillStyle = "#ffffff";
        context.font = "400 42px Georgia, 'Times New Roman', serif";
        context.fillText(prefix, regionStart, 905);
        context.fillStyle = "#ffc725";
        context.font = "700 42px Georgia, 'Times New Roman', serif";
        context.fillText(region, regionStart + prefixWidth, 905);

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

    function setBusy(busy) {
        state.busy = busy;
        elements.download.disabled = busy;
        const label = elements.download.querySelector("span");
        label.textContent = busy ? "Generando imagen…" : "Descargar credencial";
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
        return new File([blob], `IRF26-${safeFileName()}.png`, { type: "image/png" });
    }

    async function downloadCredential() {
        if (state.busy || !validateForm()) return;
        setBusy(true);
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

    updateTextPreview();
})();
