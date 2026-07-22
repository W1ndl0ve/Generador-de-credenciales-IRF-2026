(() => {
    "use strict";

    const $ = selector => document.querySelector(selector);
    const elements = {
        form: $("#credential-form"),
        credential: $("#credential"),
        roles: [...document.querySelectorAll('input[name="role"]')],
        previewRole: $("#preview-role"),
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

    const roles = {
        becario: { badge: "BECARIO/A · 2026", accent: "#ffc83d", file: "Becario" },
        mentor: { badge: "MENTOR/A · 2026", accent: "#ffad55", file: "Mentor" },
        organizador: { badge: "ORGANIZADOR/A · 2026", accent: "#ff856b", file: "Organizador" }
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

    function selectedRole() {
        return elements.roles.find(input => input.checked)?.value || "becario";
    }

    function updateRolePreview() {
        const role = selectedRole();
        elements.credential.dataset.role = role;
        elements.previewRole.textContent = roles[role].badge;
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

    function drawCurvedText(context, text, centerX, centerY, radius) {
        const spacing = 2;
        const characters = [...text];
        const widths = characters.map(character => context.measureText(character).width + spacing);
        const totalAngle = widths.reduce((sum, width) => sum + width, 0) / radius;
        let angle = -Math.PI / 2 - totalAngle / 2;

        context.save();
        context.textAlign = "center";
        context.textBaseline = "middle";
        characters.forEach((character, index) => {
            const characterAngle = widths[index] / radius;
            angle += characterAngle / 2;
            context.save();
            context.translate(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
            context.rotate(angle + Math.PI / 2);
            context.fillText(character, 0, 0);
            context.restore();
            angle += characterAngle / 2;
        });
        context.restore();
    }

    function drawCanvasPhoto(context) {
        const image = elements.portraitImage;
        const size = 420;
        const rendered = imageCoverSize(image, size, state.zoom);
        const previewSize = elements.portrait.clientWidth;
        const factor = size / previewSize;
        const x = 600 - rendered.width / 2 + state.offsetX * factor;
        const y = 535 - rendered.height / 2 + state.offsetY * factor;

        context.save();
        context.beginPath();
        context.arc(600, 535, 210, 0, Math.PI * 2);
        context.clip();
        context.drawImage(image, x, y, rendered.width, rendered.height);
        context.restore();
    }

    async function renderCredential() {
        const role = selectedRole();
        const accent = roles[role].accent;
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
        shade.addColorStop(0, "rgba(5,5,5,.7)");
        shade.addColorStop(.44, "rgba(5,5,5,.32)");
        shade.addColorStop(.87, "rgba(5,5,5,.97)");
        shade.addColorStop(1, "rgba(5,5,5,.99)");
        context.fillStyle = shade;
        context.fillRect(0, 0, 1200, 1200);

        const glow = context.createRadialGradient(600, 430, 40, 600, 430, 480);
        glow.addColorStop(0, `${accent}30`);
        glow.addColorStop(1, `${accent}00`);
        context.fillStyle = glow;
        context.fillRect(0, 0, 1200, 850);

        context.save();
        context.globalAlpha = .055;
        context.strokeStyle = "#ffffff";
        context.lineWidth = 1;
        for (let line = 100; line < 1200; line += 100) {
            context.beginPath();
            context.moveTo(line, 0);
            context.lineTo(line, 690);
            context.stroke();
            context.beginPath();
            context.moveTo(0, line);
            context.lineTo(1200, line);
            context.stroke();
        }
        context.restore();

        context.fillStyle = accent;
        context.fillRect(0, 0, 408, 7);
        context.drawImage(assets.wordmark, 72, 66, 384, 108);

        roundedRect(context, 844, 78, 284, 54, 27);
        context.fillStyle = "rgba(10,10,10,.58)";
        context.fill();
        context.strokeStyle = accent;
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = accent;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "800 18px Montserrat, Arial, sans-serif";
        context.fillText(roles[role].badge, 986, 106);

        context.save();
        context.fillStyle = accent;
        context.shadowColor = "rgba(0,0,0,.75)";
        context.shadowBlur = 10;
        context.font = "700 29px Montserrat, Arial, sans-serif";
        drawCurvedText(context, "¡Empieza mi viaje en el IRF26!", 600, 535, 270);
        context.restore();

        context.save();
        context.shadowColor = `${accent}99`;
        context.shadowBlur = 72;
        context.beginPath();
        context.arc(600, 535, 231, 0, Math.PI * 2);
        context.fillStyle = accent;
        context.fill();
        context.restore();
        context.beginPath();
        context.arc(600, 535, 218, 0, Math.PI * 2);
        context.fillStyle = "#0b0b0b";
        context.fill();

        drawCanvasPhoto(context);

        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#ffffff";
        context.font = "800 19px Montserrat, Arial, sans-serif";
        context.fillText("TALENTO REGIONAL", 600, 813);

        context.fillStyle = accent;
        let nameSize = 60;
        do {
            context.font = `900 ${nameSize}px Montserrat, Arial, sans-serif`;
            if (context.measureText(cleanText(elements.name.value)).width <= 1060) break;
            nameSize -= 2;
        } while (nameSize > 38);
        context.fillText(cleanText(elements.name.value), 600, 866);

        const prefix = "Representando a ";
        const region = elements.region.value;
        context.font = "400 27px Montserrat, Arial, sans-serif";
        const prefixWidth = context.measureText(prefix).width;
        context.font = "700 27px Montserrat, Arial, sans-serif";
        const regionWidth = context.measureText(region).width;
        const regionStart = 600 - (prefixWidth + regionWidth) / 2;
        context.textAlign = "left";
        context.fillStyle = "#ffffff";
        context.font = "400 27px Montserrat, Arial, sans-serif";
        context.fillText(prefix, regionStart, 928);
        context.fillStyle = accent;
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
        context.fillStyle = accent;
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
        return new File([blob], `IRF26-${roles[selectedRole()].file}-${safeFileName()}.png`, { type: "image/png" });
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
        updateRolePreview();
        updateTextPreview();
        elements.name.focus();
    }

    elements.name.addEventListener("input", updateTextPreview);
    elements.region.addEventListener("change", updateTextPreview);
    elements.roles.forEach(input => input.addEventListener("change", updateRolePreview));
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

    updateRolePreview();
    updateTextPreview();
})();
