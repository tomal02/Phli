(() => {
    "use strict";

    const body = document.body;

    // --- config ---
    const CLOSE_OFFSET = 220;
    const OPEN_HOVER_ZONE_WIDTH = 20;
    const FALLBACK_TABS_WIDTH = 320;
    const ANIMATION_DURATION = 300;

    // --- selectors ---
    const PANEL_TOOLBAR_SELECTOR = '#panels-container #panels #switch [aria-label="Panels"]';
    const TOOLBAR_RIGHT_REFINER = ".toolbar.toolbar-mainbar.toolbar-visible.toolbar-large.toolbar-droptarget";
    const TABS_SELECTOR = "#tabs-container";
    const BUTTON_SLOT_SELECTOR = ".button-toolbar";

    const UNLOCKED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="28" viewBox="0 -960 960 960" width="28" fill="currentColor"><path d="M264.62-600H600v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-40q0-66.85 46.58-113.42Q413.15-840 480-840t113.42 46.58Q640-746.85 640-680v80h55.38q26.85 0 45.74 18.88Q760-562.23 760-535.38v350.76q0 26.85-18.88 45.74Q722.23-120 695.38-120H264.62q-26.85 0-45.74-18.88Q200-157.77 200-184.62v-350.76q0-26.85 18.88-45.74Q237.77-600 264.62-600Zm0 440h430.76q10.77 0 17.7-6.92 6.92-6.93 6.92-17.7v-350.76q0-10.77-6.92-17.7-6.93-6.92-17.7-6.92H264.62q-10.77 0-17.7 6.92-6.92 6.93-6.92 17.7v350.76q0 10.77 6.92 17.7 6.93 6.92 17.7 6.92ZM480-300q25.31 0 42.65-17.35Q540-334.69 540-360t-17.35-42.65Q505.31-420 480-420t-42.65 17.35Q420-385.31 420-360t17.35 42.65Q454.69-300 480-300ZM240-160v-400 400Z"/></svg>`;
    const LOCKED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="28" viewBox="0 -960 960 960" width="28" fill="currentColor"><path d="M264.62-120q-26.66 0-45.64-18.98T200-184.62v-350.76q0-26.66 18.98-45.64T264.62-600H320v-80q0-66.85 46.58-113.42Q413.15-840 480-840t113.42 46.58Q640-746.85 640-680v80h55.38q26.66 0 45.64 18.98T760-535.38v350.76q0 26.66-18.98 45.64T695.38-120H264.62q-26.66 0-45.64-18.98ZM480-300q25.31 0 42.65-17.35Q540-334.69 540-360t-17.35-42.65Q505.31-420 480-420t-42.65 17.35Q420-385.31 420-360t17.35 42.65Q454.69-300 480-300ZM360-600h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>`;

    // --- state ---
    const state = {
        measuredTabsRight: null,
        initialPointerThreshold: null,
        pointerThresholdX: FALLBACK_TABS_WIDTH + CLOSE_OFFSET,
        openHoverZone: null,
        openHoverTimer: null,
        closeHoverOverlay: null,
        closeOverlayEnterHandler: null,
        hoverEnabled: false,
        resizeListener: null,
        mutationObserver: null,
        panelObserver: null,
        icons: null,
    };

    const getAppEl = () => document.getElementById("app");

    const waitFor = (selector, timeout = 10000) => new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const observer = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (found) {
                observer.disconnect();
                clearTimeout(timeoutId);
                resolve(found);
            }
        });

        observer.observe(document.documentElement, {childList: true, subtree: true});
        const timeoutId = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`waitFor: timeout waiting for ${selector}`));
        }, timeout);
    });

    const debounce = (callback, wait) => {
        let timeoutId = null;
        return (...args) => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                callback(...args);
            }, wait);
        };
    }

    const isSidebarOpen = () => {
        const app = getAppEl();
        if (!app) return false;
        return (window
                .getComputedStyle(app)
                .getPropertyValue("--phli___is-compact-mode")
                .trim() !== "1");
    };

    function setCompactModeCSSVariable(isCompactMode) {
        const app = getAppEl();
        if (!app) return;
        if (isCompactMode === true) {
            app.style.setProperty("--phli___is-compact-mode", "1");
        } else if (isCompactMode === false) {
            app.style.removeProperty("--phli___is-compact-mode");
        } else {
            const exists = window
                .getComputedStyle(app)
                .getPropertyValue("--phli___is-compact-mode") !== "";
            exists ? app.style.removeProperty("--phli___is-compact-mode") : app.style.setProperty("--phli___is-compact-mode", "1");

        }
    }

    // open means compact mode = false
    function setSidebarOpen(isOpen) {
        setCompactModeCSSVariable(!isOpen);
        if (state.closeHoverOverlay) state.closeHoverOverlay.style.left = `${state.pointerThresholdX}px`;
        updateZoneVisibility();
    }

    function applyThreshold(measuredRight) {
        state.measuredTabsRight = measuredRight;
        state.initialPointerThreshold = measuredRight + CLOSE_OFFSET;
        state.pointerThresholdX = state.initialPointerThreshold;
        if (state.closeHoverOverlay) state.closeHoverOverlay.style.left = `${state.pointerThresholdX}px`;
    }

    function measureTabsWidthOnce() {
        if (state.measuredTabsRight !== null && state.initialPointerThreshold !== null) return;

        const app = getAppEl();
        if (!app) {
            applyThreshold(FALLBACK_TABS_WIDTH);
            return;
        }

        const wasCompact = window
            .getComputedStyle(app)
            .getPropertyValue("--phli___is-compact-mode")
            .trim() === "1";
        if (wasCompact) {
            app.style.removeProperty("--phli___is-compact-mode");
        }

        requestAnimationFrame(() => {
            try {
                const tabs = document.querySelector(TABS_SELECTOR);
                const toolbar = document.querySelector(TOOLBAR_RIGHT_REFINER);
                const marker = tabs || toolbar || document.querySelector("#panels-container");
                let right = NaN;
                if (marker) {
                    const rect = marker.getBoundingClientRect();
                    if (Number.isFinite(rect.right) && rect.right > 0) right = Math.round(rect.right);
                }

                if (!Number.isFinite(right)) right = FALLBACK_TABS_WIDTH;
                applyThreshold(right);
            } catch (error) {
                console.warn(`Using fallback method due to error: ${error}`);
                applyThreshold(FALLBACK_TABS_WIDTH);
            } finally {
                if (wasCompact) app.style.setProperty("--phli___is-compact-mode", "1");
            }
        });
    }

    function viewTransitionToggle() {
        if (document.startViewTransition) {
            document.startViewTransition(() => {
                body.classList.add("view-transition-active");
                setSidebarOpen(!isSidebarOpen())
                updateZoneVisibility();

                setTimeout(() => {
                    body.classList.remove("view-transition-active");
                }, ANIMATION_DURATION);
            });
        } else {
            setSidebarOpen(!isSidebarOpen());
        }
    }

    function createOpenHoverZone() {
        if (state.openHoverZone) return state.openHoverZone;
        const zone = document.createElement("div");
        zone.id = "phli-open-hover-zone";
        zone.style.width = `${OPEN_HOVER_ZONE_WIDTH}px` // Other styles applied directly in CSS

        zone.addEventListener("pointerenter", () => {
            clearTimeout(state.openHoverTimer);
            state.openHoverTimer = setTimeout(() => {
                if (!isSidebarOpen()) viewTransitionToggle();
            }, 50);
        }, {passive: true});

        zone.addEventListener("pointerleave", () => {
            clearTimeout(state.openHoverTimer);
            state.openHoverTimer = null;
        }, {passive: true});

        body.appendChild(zone);
        state.openHoverZone = zone;
        return zone;
    }

    function destroyOpenHoverZone() {
        if (!state.openHoverZone) return;
        clearTimeout(state.openHoverTimer);
        state.openHoverTimer = null;
        state.openHoverZone.remove();
        state.openHoverZone = null;
    }

    function createCloseOverlay() {
        if (state.closeHoverOverlay) return state.closeHoverOverlay;
        const overlay = document.createElement("div");
        overlay.id = "phli-close-overlay";
        overlay.style.left = `${state.pointerThresholdX}px`;
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";

        state.closeOverlayEnterHandler = () => {
            if (isSidebarOpen()) viewTransitionToggle();
        };
        overlay.addEventListener("pointerenter", state.closeOverlayEnterHandler, {passive: true});

        body.appendChild(overlay);
        state.closeHoverOverlay = overlay;
        return overlay;
    }

    function destroyCloseOverlay() {
        if (!state.closeHoverOverlay) return;
        if (state.closeOverlayEnterHandler) {
            state.closeHoverOverlay.removeEventListener("pointerenter", state.closeOverlayEnterHandler);
            state.closeOverlayEnterHandler = null;
        }
        state.closeHoverOverlay.remove();
        state.closeHoverOverlay = null;
    }

    function updateZoneVisibility() {
        if (!state.openHoverZone || !state.closeHoverOverlay) return;
        const isOpen = isSidebarOpen();

        state.openHoverZone.style.opacity = isOpen ? "0" : "1";
        state.openHoverZone.style.pointerEvents = isOpen ? "none" : "auto";

        state.closeHoverOverlay.style.opacity = isOpen ? "1" : "0";
        state.closeHoverOverlay.style.pointerEvents = isOpen ? "auto" : "none";
    }

    function setupPanelMutationObserver() {
        waitFor(".panel-collapse-guard", 10000)
            .then((panelGuard) => {
                state.panelObserver = new MutationObserver(() => {
                    const isPanelOpen = panelGuard.getAttribute("aria-hidden") === "false";

                    if (isPanelOpen) {
                        disableHoverLogic();
                        setSidebarOpen(false);
                    } else {
                        enableHoverLogic();
                    }
                });
            })
            .catch(() => console.warn("Panel guard observer not set up (element not found)."));
    }

    function createMutationObserver() {
        if (state.mutationObserver) return;
        state.mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type !== "childList" || mutation.addedNodes.length === 0) continue;
                for (const addedNode of mutation.addedNodes) {
                    if (!(addedNode instanceof Element)) continue;
                    if (addedNode.id === "browser" || addedNode.querySelector?.("#browser")) {
                        if (state.hoverEnabled && !state.openHoverZone) initializeHoverFunction();
                    }
                    if (addedNode.id === "webpage-stack" || addedNode.id === "tabs-container" || addedNode.querySelector?.("#tabs-container")) {
                        if (state.hoverEnabled) updateZoneVisibility();
                    }
                }
            }
        });
        state.mutationObserver.observe(body, {childList: true, subtree: true});
    }

    function destroyMutationObserver() {
        if (!state.mutationObserver) return;
        state.mutationObserver.disconnect();
        state.mutationObserver = null;
    }

    function initializeHoverFunction() {
        if (!state.hoverEnabled) return;
        measureTabsWidthOnce();

        createOpenHoverZone();
        createCloseOverlay();
        updateZoneVisibility();

        state.resizeListener = debounce(() => {
            if (state.closeHoverOverlay) state.closeHoverOverlay.style.left = `${state.pointerThresholdX}px`;
        }, 250);
        window.addEventListener("resize", state.resizeListener, {passive: true});
        createMutationObserver();
    }

    function teardownHoverFunction() {
        destroyOpenHoverZone();
        destroyCloseOverlay();
        if (state.resizeListener) {
            window.removeEventListener("resize", state.resizeListener);
            state.resizeListener = null;
        }
        destroyMutationObserver();
    }

    function enableHoverLogic() {
        if (state.hoverEnabled) return;
        state.hoverEnabled = true;
        initializeHoverFunction();
    }

    function disableHoverLogic() {
        if (!state.hoverEnabled) return;
        state.hoverEnabled = false;
        teardownHoverFunction();
    }

    function makeLockButton() {
        const toolbar = document.querySelector(PANEL_TOOLBAR_SELECTOR);
        if (!toolbar) return null;

        const slot = findOrCreateButtonSlot(toolbar);
        const btn = createLockButtonElement();

        const iconWrap = document.createElement("span");
        iconWrap.className = "button-icon";
        iconWrap.setAttribute("aria-hidden", "true");
        iconWrap.appendChild(state.icons.unlocked.cloneNode(true));

        btn.appendChild(iconWrap);
        slot.appendChild(btn);
        slot.dataset.locked = "false";

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleLockState(slot, iconWrap);
        });

        return {slot, btn};
    }

    function findOrCreateButtonSlot(toolbar) {
        let slot = toolbar.querySelector(`${BUTTON_SLOT_SELECTOR}[style*="display: none"]`);

        if (!slot) {
            slot = document.createElement("div");
            slot.className = "button-toolbar panel-clickoutside-ignore";
            toolbar.appendChild(slot);
        }

        slot.style.removeProperty("display");
        slot.classList.add("panel-clickoutside-ignore"); // ensures class is present on re-used existing slots
        slot.setAttribute("aria-hidden", "false");
        slot.innerHTML = "";

        return slot;
    }

    function createLockButtonElement() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.name = "PanelLock";
        btn.className = "ToolbarButton-Button";
        btn.title = "Toggle sidebar hover lock";
        btn.draggable = false;
        btn.tabIndex = 0;
        btn.setAttribute("aria-label", "Lock sidebar hover state");
        btn.setAttribute("role", "button");

        return btn;
    }

    function toggleLockState(slot, iconWrap) {
        const isCurrentlyLocked = slot.dataset.locked === "true";
        const willBeLocked = !isCurrentlyLocked;

        slot.dataset.locked = willBeLocked.toString();
        iconWrap.innerHTML = "";
        iconWrap.appendChild((willBeLocked ? state.icons.locked : state.icons.unlocked).cloneNode(true));

        if (willBeLocked) {
            disableHoverLogic();
        } else {
            if (state.initialPointerThreshold === null) {
                measureTabsWidthOnce();
                state.pointerThresholdX = state.initialPointerThreshold ?? FALLBACK_TABS_WIDTH + CLOSE_OFFSET;
            } else {
                state.pointerThresholdX = state.initialPointerThreshold;
            }
            enableHoverLogic();
        }
    }

    function initIcons() {
        const parser = new DOMParser();
        state.icons = {
            unlocked: parser.parseFromString(UNLOCKED_SVG, "text/html").body.firstChild,
            locked: parser.parseFromString(LOCKED_SVG, "text/html").body.firstChild,
        };
    }

    (function boot() {
        initIcons();
        measureTabsWidthOnce();
        enableHoverLogic();
        setupPanelMutationObserver();

        waitFor(PANEL_TOOLBAR_SELECTOR, 10000)
            .then(makeLockButton)
            .catch(() => console.warn("Lock button not inserted (toolbar not found)."));
    })();

    window.addEventListener("beforeunload", teardownHoverFunction, {passive: true});
})();
