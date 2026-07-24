(() => {
    "use strict";

    const $ = selector => document.querySelector(selector);
    const elements = {
        form: $("#credential-form"),
        credential: $("#credential"),
        roles: [...document.querySelectorAll('input[name="role"]')],
        previewRole: $("#preview-role"),
        name: $("#name"),
        regionField: $("#region-field"),
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
        becario: { badge: "", accent: "#ffc400", file: "Becario" },
        mentor: { badge: "MENTOR", accent: "#ffad55", file: "Mentor" },
        organizador: { badge: "ORGANIZADOR", accent: "#ff856b", file: "Organizador" }
    };

    const supabaseClient = createSupabaseClient();

    const assets = {
        background: loadAsset("Fondo.jpg"),
        wordmark: loadAsset("logo_Arriba_crendenciales.png"),
        partners: loadAsset("diseño_footer.png")
    };

    function createSupabaseClient() {
        const config = window.IRF_SUPABASE_CONFIG;
        if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) return null;
        return window.supabase.createClient(config.url, config.publishableKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false
            }
        });
    }

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
        const usesRegion = role === "becario";
        elements.credential.dataset.role = role;
        elements.previewRole.textContent = roles[role].badge;
        elements.previewRole.hidden = usesRegion;
        elements.regionField.hidden = !usesRegion;
        elements.region.disabled = !usesRegion;
        elements.region.required = usesRegion;
        if (!usesRegion) setError("region", "");
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
        elements.previewRegion.textContent = region || "Mi región";
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

        if (selectedRole() === "becario" && !region) {
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
        if (!file) {
            setError("photo", "No se seleccionó ninguna imagen.");
            return;
        }

        const accepted = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/pjpeg"];
        const extensionAllowed = /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!accepted.includes(file.type) && !extensionAllowed) {
            elements.photoInput.value = "";
            setError("photo", "Elige una imagen JPG, PNG o WEBP.");
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            elements.photoInput.value = "";
            setError("photo", "La imagen supera los 15 MB. Elige una más ligera.");
            return;
        }

        const nextUrl = URL.createObjectURL(file);
        const probe = new Image();
        probe.onload = () => {
            console.log("Probe loaded, size:", probe.naturalWidth, "x", probe.naturalHeight);
            if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
            state.photoUrl = nextUrl;
            state.photoFile = file;
            elements.portraitImage.onload = () => {
                console.log("Portrait image loaded, size:", elements.portraitImage.naturalWidth, "x", elements.portraitImage.naturalHeight);
                centerPhoto();
                elements.portraitImage.hidden = false;
                elements.portraitPlaceholder.hidden = true;
                elements.controls.hidden = false;
                elements.uploadTitle.textContent = file.name;
                elements.uploadHelp.textContent = `${fileSizeLabel(file.size)} · Lista para usar`;
            };
            elements.portraitImage.onerror = (e) => {
                console.error("Portrait image error:", e);
                setError("photo", "No pudimos cargar la imagen en el preview.");
            };
            elements.portraitImage.src = nextUrl;
        };
        probe.onerror = () => {
            URL.revokeObjectURL(nextUrl);
            elements.photoInput.value = "";
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
        const spacing = 1.5;
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

    function drawCanvasPhoto(context, centerY) {
        const image = elements.portraitImage;
        const size = 494;
        const rendered = imageCoverSize(image, size, state.zoom);
        const previewSize = elements.portrait.clientWidth;
        const factor = size / previewSize;
        const x = 600 - rendered.width / 2 + state.offsetX * factor;
        const y = centerY - rendered.height / 2 + state.offsetY * factor;

        context.save();
        context.beginPath();
        context.arc(600, centerY, 247, 0, Math.PI * 2);
        context.clip();
        context.drawImage(image, x, y, rendered.width, rendered.height);
        context.restore();
    }

    function renderStoredPhoto() {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 800;
        const context = canvas.getContext("2d", { alpha: false });
        const image = elements.portraitImage;
        const rendered = imageCoverSize(image, 800, state.zoom);
        const factor = 800 / elements.portrait.clientWidth;
        const x = 400 - rendered.width / 2 + state.offsetX * factor;
        const y = 400 - rendered.height / 2 + state.offsetY * factor;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 800, 800);
        context.drawImage(image, x, y, rendered.width, rendered.height);
        return canvas;
    }

    async function renderCredential() {
        const role = selectedRole();
        const accent = roles[role].accent;
        const portraitCenterY = 583;
        const fontLoad = document.fonts?.load('700 38px "Roca One"') || Promise.resolve();
        await Promise.all([
            waitForImage(assets.background),
            waitForImage(assets.wordmark),
            waitForImage(assets.partners),
            waitForImage(elements.portraitImage),
            fontLoad,
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

        const glow = context.createRadialGradient(600, 625, 40, 600, 625, 480);
        glow.addColorStop(0, `${accent}22`);
        glow.addColorStop(1, `${accent}00`);
        context.fillStyle = glow;
        context.fillRect(0, 0, 1200, 1200);

        context.drawImage(assets.wordmark, 110, 450, 980, 300, 390, 72, 420, 126);

        context.save();
        context.fillStyle = accent;
        context.shadowColor = "rgba(0,0,0,.86)";
        context.shadowBlur = 10;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 2;
        context.font = `700 38px "Roca One", "Fraunces", Georgia, serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        drawCurvedText(context, "Empieza mi viaje en el IRF26", 600, 579, 300);
        context.restore();

        context.save();
        context.fillStyle = accent;
        context.shadowColor = accent;
        context.shadowBlur = 12;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.globalAlpha = 0.24;
        context.font = `700 38px "Roca One", "Fraunces", Georgia, serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        drawCurvedText(context, "Empieza mi viaje en el IRF26", 600, 579, 300);
        context.restore();

        context.save();
        context.shadowColor = `${accent}73`;
        context.shadowBlur = 58;
        context.beginPath();
        context.arc(600, portraitCenterY, 238, 0, Math.PI * 2);
        context.fillStyle = accent;
        context.fill();
        context.restore();

        drawCanvasPhoto(context, portraitCenterY);

        // Posiciones basadas en porcentajes del canvas (1200px) para igualar el CSS preview
        const dataTop = 1200 * 0.727;           // top: 72.7% = 872.4
        const rowGap = 1200 * 0.015;            // row-gap: 1.5cqw ≈ 18px
        const nameFontSize = 1200 * 0.05;   // ≈ 60px — equivalente visual real, sin el tope de pantalla
        const regionFontSize = 1200 * 0.032; // ≈ 38.4px — equivalente visual real, sin el tope de pantalla
        const nameLineHeight = nameFontSize * 1.18;
        const regionRowHeight = 1200 * 0.054;   // min-height: 5.4cqw = 64.8px

        const nameBaseline = dataTop + nameLineHeight * 0.8;
        const regionBaseline = nameBaseline + rowGap + regionRowHeight / 2 + regionFontSize * 0.35;

        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = accent;
        let nameSize = 60;
        do {
            context.font = `700 ${nameSize}px "Roca One", "Fraunces", Georgia, serif`;
            if (context.measureText(cleanText(elements.name.value)).width <= 1060) break;
            nameSize -= 2;
        } while (nameSize > 40);
        context.fillText(cleanText(elements.name.value), 600, nameBaseline);

if (role === "becario") {
            const prefix = "El talento nace en ";
            const region = `#${elements.region.value}`;
            context.font = "400 38px \"Roca One\", \"Fraunces\", Georgia, serif";
            const prefixWidth = context.measureText(prefix).width;
            context.font = "400 38px \"Roca One\", \"Fraunces\", Georgia, serif";
            const regionWidth = context.measureText(region).width;
            const regionStart = 600 - (prefixWidth + regionWidth) / 2;
            context.textAlign = "left";
            context.fillStyle = "#ffffff";
            context.font = "400 38px \"Roca One\", \"Fraunces\", Georgia, serif";
            context.fillText(prefix, regionStart, regionBaseline);
            context.fillStyle = accent;
            context.font = "400 38px \"Roca One\", \"Fraunces\", Georgia, serif";
            context.fillText(region, regionStart + prefixWidth, regionBaseline);
        } else {
            context.textAlign = "center";
            context.font = "700 24px \"Roca One\", \"Montserrat\", Arial, sans-serif";
            const membershipWidth = 300;
            roundedRect(context, 600 - membershipWidth / 2, 962, membershipWidth, 56, 28);
            context.fillStyle = `${accent}12`;
            context.fill();
            context.strokeStyle = accent;
            context.lineWidth = 2;
            context.stroke();
            context.fillStyle = accent;
            context.shadowColor = `${accent}33`;
            context.shadowBlur = 16;
            context.fillText(roles[role].badge, 600, 990);
            context.shadowBlur = 0;
        }

        context.drawImage(assets.partners, 17, 100, 1310, 58, 120, 1080, 960, 43);

        return canvas;
    }

    function canvasToBlob(canvas, type = "image/png", quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error("No se pudo crear el archivo.")),
                type,
                quality
            );
        });
    }

    async function compressedWebp(canvas, maxBytes, qualities) {
        for (const quality of qualities) {
            const blob = await canvasToBlob(canvas, "image/webp", quality);
            if (blob.type !== "image/webp") {
                throw new Error("Este navegador no permite optimizar imágenes WebP.");
            }
            if (blob.size <= maxBytes) return blob;
        }
        throw new Error("No se pudo comprimir la imagen dentro del límite permitido.");
    }

    async function uploadImage(bucket, path, blob) {
        const { error } = await supabaseClient.storage
            .from(bucket)
            .upload(path, blob, {
                cacheControl: "31536000",
                contentType: "image/webp",
                upsert: false
            });
        if (error) throw error;
    }

    async function saveSubmission(credentialCanvas) {
        if (!supabaseClient) throw new Error("Supabase no está disponible.");

        const id = crypto.randomUUID();
        const role = selectedRole();
        const photoPath = `${role}/${id}/photo.webp`;
        const credentialPath = `${role}/${id}/credencial.webp`;
        const photoCanvas = renderStoredPhoto();
        const [photoBlob, credentialBlob] = await Promise.all([
            compressedWebp(photoCanvas, 1024 * 1024, [.82, .76, .7, .64]),
            compressedWebp(credentialCanvas, 1536 * 1024, [.86, .82, .78, .72])
        ]);

        await Promise.all([
            uploadImage("irf-photos", photoPath, photoBlob),
            uploadImage("irf-credentials", credentialPath, credentialBlob)
        ]);

        const { error } = await supabaseClient
            .from("credential_records")
            .insert({
                id,
                full_name: cleanText(elements.name.value),
                role,
                region: role === "becario" ? elements.region.value : null,
                photo_path: photoPath,
                credential_path: credentialPath,
                photo_bytes: photoBlob.size,
                credential_bytes: credentialBlob.size
            });
        if (error) throw error;
        return id;
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
        label.textContent = busy ? "Guardando y generando…" : "Descargar credencial";
    }

    function showToast(title, message) {
        window.clearTimeout(state.toastTimer);
        elements.toastTitle.textContent = title;
        elements.toastMessage.textContent = message;
        elements.toast.classList.add("is-visible");
        state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3600);
    }

    async function makeFile(canvas) {
        const blob = await canvasToBlob(canvas, "image/png");
        return new File([blob], `IRF26-${roles[selectedRole()].file}-${safeFileName()}.png`, { type: "image/png" });
    }

    async function downloadCredential() {
        if (state.busy || !validateForm()) return;
        setBusy(true);
        try {
            const canvas = await renderCredential();
            await saveSubmission(canvas);
            const file = await makeFile(canvas);
            const url = URL.createObjectURL(file);
            const link = document.createElement("a");
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
            showToast("¡Guardada y descargada!", "Tu registro quedó archivado y el PNG está listo para compartir.");
        } catch (error) {
            console.error("No se pudo guardar la credencial:", error);
            showToast("No pudimos guardarla", "Revisa tu conexión e inténtalo otra vez. La descarga no se realizó.");
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
    elements.upload.addEventListener("click", () => {
        if (state.photoFile) {
            elements.photoInput.value = "";
            setError("photo", "");
        }
    });
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
