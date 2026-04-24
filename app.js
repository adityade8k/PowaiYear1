// app.js - Main Three.js application logic

import { config } from './config.js';

// ─── JoystickController (from CommieP/touchScreenFPS7) ────────────────────────
class JoystickController {
    constructor(stickID, maxDistance, deadzone) {
        this.id = stickID;
        // stick = the visual thumb image; container = the full hit area
        const stick = document.getElementById(stickID);
        const container = document.getElementById(stickID + 'Container');
        this.dragStart = null;
        this.touchId = null;
        this.active = false;
        this.value = { x: 0, y: 0 };

        const self = this;

        function handleDown(event) {
            self.active = true;
            stick.style.transition = '0s';
            event.preventDefault();
            if (event.changedTouches) {
                self.dragStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
                self.touchId = event.changedTouches[0].identifier;
            } else {
                self.dragStart = { x: event.clientX, y: event.clientY };
            }
        }

        function handleMove(event) {
            if (!self.active) return;
            let clientX, clientY;
            if (event.changedTouches) {
                let found = null;
                for (let i = 0; i < event.changedTouches.length; i++) {
                    if (self.touchId === event.changedTouches[i].identifier) {
                        found = event.changedTouches[i];
                        break;
                    }
                }
                if (!found) return;
                clientX = found.clientX;
                clientY = found.clientY;
            } else {
                clientX = event.clientX;
                clientY = event.clientY;
            }
            const xDiff = clientX - self.dragStart.x;
            const yDiff = clientY - self.dragStart.y;
            const angle = Math.atan2(yDiff, xDiff);
            const distance = Math.min(maxDistance, Math.hypot(xDiff, yDiff));
            stick.style.transform = `translate3d(${distance * Math.cos(angle)}px, ${distance * Math.sin(angle)}px, 0px)`;
            const distance2 = distance < deadzone ? 0 : maxDistance / (maxDistance - deadzone) * (distance - deadzone);
            self.value = {
                x: parseFloat((distance2 * Math.cos(angle) / maxDistance).toFixed(4)),
                y: parseFloat((distance2 * Math.sin(angle) / maxDistance).toFixed(4))
            };
        }

        function handleUp(event) {
            if (!self.active) return;
            if (event.changedTouches && self.touchId !== event.changedTouches[0].identifier) return;
            stick.style.transition = '.2s';
            stick.style.transform = 'translate3d(0px, 0px, 0px)';
            self.value = { x: 0, y: 0 };
            self.touchId = null;
            self.active = false;
        }

        // Attach touchstart/mousedown to the full container for a large, reliable hit area
        container.addEventListener('mousedown', handleDown);
        container.addEventListener('touchstart', handleDown, { passive: false });
        document.addEventListener('mousemove', handleMove, { passive: false });
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('mouseup', handleUp);
        document.addEventListener('touchend', handleUp);
    }
}
// ──────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
    getFirestore,
    collection,
    addDoc,
    getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

class PowaiExperience {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.clock = new THREE.Clock();
        this.isLocked = false;
        this.hasExplored = false;
        this.scrollY = 0;
        this.previousScrollY = 0;
        this.isPanning = false;
        this.panStartTime = 0;
        this.panDuration = 0;
        this.startPosition = null;
        this.endPosition = null;
        this.isScrollIndicatorReady = false;
        this.hasScrollTriggerFired = false;
        this.triggerSequenceStartTime = null;
        this.autoScrollStartY = null;
        this.autoScrollTargetY = 0;
        this.hasTriggerSequenceCompleted = false;
        this.isMenuMode = false;
        this.cameraTransition = null;
        this.modelDefaultRotationY = 0;
        this.modelRotationReset = null;
        this.isModelRotationStopped = false;
        this.isExploring = false;          // true when explore mode is active (camera panned)
        this.isReturningFromExplore = false; // true after scrolling up from explore, before scrolling down
        this.modelLerpAnimation = null;    // { startTime, duration, fromY, toY }
        this.cameraRotationReset = null;   // { startTime, duration, fromYaw, fromPitch }
        this.reticle = null;
        this.raycaster = new THREE.Raycaster();
        this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this.joystick1 = null;
        this.joystick2 = null;
        this.pendingMemory = null; // mobile two-step: { file, description } stored before placement
        this.isAuthModalOpen = false;
        /** @type {'login' | 'register'} */
        this.authMode = 'login';
        this.isAuthPending = false;
        this.isAuthenticated = false;
        this.firebaseApp = null;
        this.firebaseAuth = null;
        this.firestoreDb = null;
        this.firebaseStorage = null;
        this.isMemoryDialogOpen = false;
        this.isMemorySubmitPending = false;
        this.enteredAsLoggedIn = false;
        /** @type {Array<{id:string, description:string, imageUrl:string|null, position:THREE.Vector3, orb:THREE.Mesh, plane:THREE.Mesh, isNear:boolean}>} */
        this.memories = [];
        this.memoriesLoaded = false;
        this.moveState = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };

        this.init();
        this.setupEventListeners();
        this.animate();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(config.scene.backgroundColor);
        this.scene.fog = new THREE.Fog(config.scene.fog.color, config.scene.fog.near, config.scene.fog.far);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            config.camera.fov,
            window.innerWidth / window.innerHeight,
            config.camera.near,
            config.camera.far
        );
        this.camera.position.set(
            config.camera.initialPosition.x,
            config.camera.initialPosition.y,
            config.camera.initialPosition.z
        );

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('threejs-container').appendChild(this.renderer.domElement);

        // Lights
        const ambientLight = new THREE.AmbientLight(
            config.lights.ambient.color,
            config.lights.ambient.intensity
        );
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(
            config.lights.directional.color,
            config.lights.directional.intensity
        );
        directionalLight.position.set(
            config.lights.directional.position.x,
            config.lights.directional.position.y,
            config.lights.directional.position.z
        );
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Controls
        this.controls = new THREE.PointerLockControls(this.camera, document.body);
        this.scene.add(this.controls.getObject());
        this.camera.position.set(0, 0, 0);
        this.controls.getObject().position.set(
            config.camera.initialPosition.x,
            config.camera.initialPosition.y,
            config.camera.initialPosition.z
        );

        // Reticle (crosshair ring attached to camera)
        this.createReticle();

        // Mobile: correct Euler order for direct rotation manipulation
        if (this.isMobile) {
            this.camera.rotation.order = 'YXZ';
        }

        // Load GLTF model
        this.loadModel();

        // Apply config to HTML elements
        this.applyConfigToHTML();
        this.applySequenceInitialState();
        this.initFirebase();
        this.syncBodyUiState();
        this.scrollY = window.scrollY;
        this.updateScrollAnimations();
        this.startIntroSequence();

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    createReticle() {
        const { innerRadius, outerRadius, segments, color, zOffset } = config.reticle;
        const geo = new THREE.RingGeometry(innerRadius, outerRadius, segments);
        const mat = new THREE.MeshBasicMaterial({
            color,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.85
        });
        this.reticle = new THREE.Mesh(geo, mat);
        this.reticle.position.set(0, 0, zOffset);
        this.reticle.renderOrder = 999;
        this.reticle.visible = false;
        this.camera.add(this.reticle);
    }

    getCameraAnchor() {
        return this.controls ? this.controls.getObject() : this.camera;
    }

    loadModel() {
        const loader = new THREE.GLTFLoader();
        loader.load(
            config.model.path,
            (gltf) => {
                this.model = gltf.scene;
                this.model.position.set(
                    config.model.initialPosition.x,
                    config.model.initialPosition.y,
                    config.model.initialPosition.z
                );
                this.model.scale.set(
                    config.model.scale.x,
                    config.model.scale.y,
                    config.model.scale.z
                );
                this.modelDefaultRotationY = this.model.rotation.y % (Math.PI * 2);
                this.model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.scene.add(this.model);
                this.applySequenceInitialState();
            },
            (progress) => {
                console.log('Model loading progress:', progress);
            },
            (error) => {
                console.error('Error loading model:', error);
            }
        );
    }

    applyConfigToHTML() {
        document.body.style.height = `${config.scroll.sections * 100}vh`;

        // Header
        const header = document.getElementById('header');
        const headerCfg = (this.isMobile && config.text.header.mobile) ? config.text.header.mobile : config.text.header;
        header.textContent = config.text.header.text;
        header.style.fontSize = headerCfg.fontSize;
        header.style.color = config.text.header.color;
        header.style.top = headerCfg.position.top;
        header.style.left = headerCfg.position.left;
        header.style.transform = headerCfg.position.transform;
        header.style.transitionDuration = `${config.intro.headerFadeDuration}ms`;

        // Sub-header
        const subHeader = document.getElementById('sub-header');
        const subHeaderCfg = (this.isMobile && config.text.subHeader.mobile) ? config.text.subHeader.mobile : config.text.subHeader;
        subHeader.textContent = config.text.subHeader.text;
        subHeader.style.fontSize = subHeaderCfg.fontSize;
        subHeader.style.color = config.text.subHeader.color;
        subHeader.style.top = subHeaderCfg.position.top;
        subHeader.style.left = subHeaderCfg.position.left;
        subHeader.style.transform = subHeaderCfg.position.transform;
        subHeader.style.transitionDuration = `${config.intro.subHeaderFadeDuration}ms`;

        // Scroll indicator
        const scrollIndicator = document.getElementById('scroll-indicator');
        const scrollLabel = document.getElementById('scroll-label');
        const scrollArrow = document.getElementById('scroll-arrow');
        scrollIndicator.style.bottom = config.scrollIndicator.position.bottom;
        scrollIndicator.style.left = config.scrollIndicator.position.left;
        scrollIndicator.style.transform = config.scrollIndicator.position.transform;
        scrollIndicator.style.color = config.scrollIndicator.color;
        scrollIndicator.style.gap = config.scrollIndicator.gap;
        scrollLabel.textContent = config.scrollIndicator.text;
        scrollLabel.style.fontSize = config.scrollIndicator.fontSize;
        scrollLabel.style.letterSpacing = config.scrollIndicator.letterSpacing;
        scrollArrow.style.width = config.scrollIndicator.arrow.width;
        scrollArrow.style.height = config.scrollIndicator.arrow.height;
        scrollArrow.style.borderRightWidth = config.scrollIndicator.arrow.borderWidth;
        scrollArrow.style.borderBottomWidth = config.scrollIndicator.arrow.borderWidth;

        // Button container
        const buttonContainer = document.getElementById('button-container');
        buttonContainer.style.bottom = config.buttons.container.position.bottom;
        buttonContainer.style.left = config.buttons.container.position.left;
        buttonContainer.style.transform = config.buttons.container.position.transform;
        buttonContainer.style.gap = config.buttons.container.gap;

        // Explore button
        const exploreBtn = document.getElementById('explore-btn');
        exploreBtn.textContent = config.buttons.explore.text;
        exploreBtn.style.width = config.buttons.shared.width;
        exploreBtn.style.padding = config.buttons.shared.padding;

        // Login button
        const loginBtn = document.getElementById('login-btn');
        loginBtn.textContent = config.buttons.login.text;
        loginBtn.style.width = config.buttons.shared.width;
        loginBtn.style.padding = config.buttons.shared.padding;

        // Instructions
        const instructions = document.getElementById('instructions');
        instructions.innerHTML = config.instructions.text;
        instructions.style.bottom = config.instructions.position.bottom;
        instructions.style.left = config.instructions.position.left;
        instructions.style.backgroundColor = config.instructions.backgroundColor;
        instructions.style.color = config.instructions.color;
        instructions.style.padding = config.instructions.padding;
        instructions.style.borderRadius = config.instructions.borderRadius;
        instructions.style.fontSize = config.instructions.fontSize;

        // Auth modal copy
        document.getElementById('auth-helper-copy').textContent = config.auth.copy.helper;
        document.querySelector('label[for="auth-email"]').textContent = config.auth.copy.emailLabel;
        document.querySelector('label[for="auth-password"]').textContent = config.auth.copy.passwordLabel;
        this.setAuthMode('login');
    }

    startIntroSequence() {
        window.setTimeout(() => {
            document.getElementById('header').classList.add('is-visible');
        }, config.intro.headerFadeDelay);

        window.setTimeout(() => {
            document.getElementById('sub-header').classList.add('is-visible');
        }, config.intro.subHeaderFadeDelay);

        window.setTimeout(() => {
            this.isScrollIndicatorReady = true;
            this.updateScrollIndicatorVisibility();
        }, config.intro.scrollIndicatorDelay);
    }

    showScrollIndicator() {
        const scrollIndicator = document.getElementById('scroll-indicator');
        scrollIndicator.classList.remove('is-hidden');
        scrollIndicator.classList.add('is-visible');
    }

    hideScrollIndicator() {
        const scrollIndicator = document.getElementById('scroll-indicator');
        scrollIndicator.classList.remove('is-visible');
        scrollIndicator.classList.add('is-hidden');
    }

    showButtonContainer() {
        const buttonContainer = document.getElementById('button-container');
        buttonContainer.style.opacity = '1';
        buttonContainer.style.pointerEvents = 'auto';
        buttonContainer.style.transform = `${config.buttons.container.position.transform} translateY(0px)`;
    }

    hideButtonContainer() {
        const buttonContainer = document.getElementById('button-container');
        buttonContainer.style.opacity = '0';
        buttonContainer.style.pointerEvents = 'none';
        buttonContainer.style.transform =
            `${config.buttons.container.position.transform} translateY(${config.buttons.container.translateStartY}px)`;
    }

    applySequenceInitialState() {
        if (this.hasExplored) {
            if (this.model) {
                this.model.position.set(
                    config.model.finalPosition.x,
                    config.model.finalPosition.y,
                    config.model.finalPosition.z
                );
                this.model.rotation.y = this.modelDefaultRotationY;
            }
            this.isMenuMode = false;
            this.isModelRotationStopped = true;
            this.hideButtonContainer();
            return;
        }

        if (this.model) {
            this.model.position.set(
                config.model.initialPosition.x,
                config.model.initialPosition.y,
                config.model.initialPosition.z
            );
            this.model.rotation.y = this.modelDefaultRotationY;
        }

        const buttonContainer = document.getElementById('button-container');
        buttonContainer.style.opacity = '0';
        buttonContainer.style.transform =
            `${config.buttons.container.position.transform} translateY(${config.buttons.container.translateStartY}px)`;
        this.isMenuMode = false;
        this.isModelRotationStopped = false;
    }

    initFirebase() {
        if (!this.isFirebaseConfigured()) {
            return;
        }

        this.firebaseApp = initializeApp(config.firebase.config);
        this.firebaseAuth = getAuth(this.firebaseApp);
        this.firestoreDb = getFirestore(this.firebaseApp);
        this.firebaseStorage = getStorage(this.firebaseApp);

        onAuthStateChanged(this.firebaseAuth, (user) => {
            this.isAuthenticated = Boolean(user);
            this.updateInstructionsText();
            // Keep the mobile Add Memory button in sync with live auth state
            if (this.isMobile) {
                const memBtn = document.getElementById('mobile-memory-btn');
                if (memBtn) memBtn.hidden = !this.isAuthenticated;
            }
        });
    }

    updateInstructionsText() {
        if (this.isMobile) {
            document.getElementById('instructions').innerHTML = config.instructions.mobileText;
        } else {
            const extra = this.enteredAsLoggedIn ? '<br>V to add a memory' : '';
            document.getElementById('instructions').innerHTML = config.instructions.text + extra;
        }
    }

    isFirebaseConfigured() {
        const firebaseConfig = config.firebase.config;

        return config.firebase.enabled &&
            Boolean(firebaseConfig.apiKey) &&
            Boolean(firebaseConfig.authDomain) &&
            Boolean(firebaseConfig.projectId) &&
            Boolean(firebaseConfig.appId);
    }

    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }

    isAllowedEmail(email) {
        const normalizedEmail = this.normalizeEmail(email);
        const isAllowedStudentEmail = config.auth.allowedStudentEmailPattern.test(normalizedEmail);
        const isSecretEmail = config.auth.secretAllowedEmails.includes(normalizedEmail);
        return isAllowedStudentEmail || isSecretEmail;
    }

    getEmailValidationMessage(email) {
        if (!email) {
            return config.auth.copy.emailInvalid;
        }

        return this.isAllowedEmail(email) ? '' : config.auth.copy.emailInvalid;
    }

    getPasswordValidationMessage(password) {
        if (!password || password.length < 6) {
            return config.auth.copy.passwordInvalid;
        }
        return '';
    }

    syncBodyUiState() {
        document.body.classList.toggle('is-scroll-locked', this.isLocked);
        document.body.classList.toggle('is-modal-open', this.isAuthModalOpen || this.isMemoryDialogOpen);
    }

    setAuthMode(mode) {
        this.authMode = mode;

        const isRegister = mode === 'register';
        const modeToggle = document.getElementById('auth-mode-toggle');
        modeToggle.textContent = isRegister
            ? config.auth.copy.existingProfileHint
            : config.auth.copy.firstTimeHint;

        document.getElementById('auth-submit-btn').textContent = isRegister
            ? config.auth.copy.registerAction
            : config.auth.copy.loginAction;

        const passwordInput = document.getElementById('auth-password');
        passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';

        this.clearAuthStatus();
    }

    clearAuthStatus() {
        const authStatus = document.getElementById('auth-status');
        authStatus.textContent = '';
        delete authStatus.dataset.state;
    }

    setAuthStatus(message, state = 'info') {
        const authStatus = document.getElementById('auth-status');
        authStatus.textContent = message;
        authStatus.dataset.state = state;
    }

    setAuthPendingState(isPending, actionLabel = '') {
        this.isAuthPending = isPending;

        document.getElementById('auth-email').disabled = isPending;
        document.getElementById('auth-password').disabled = isPending;
        document.getElementById('auth-mode-toggle').disabled = isPending;
        document.getElementById('auth-modal-close').disabled = isPending;
        document.getElementById('auth-submit-btn').disabled = isPending;

        if (!isPending) {
            this.setAuthMode(this.authMode);
            return;
        }

        if (actionLabel === 'login') {
            document.getElementById('auth-submit-btn').textContent = 'Logging in...';
        }

        if (actionLabel === 'register') {
            document.getElementById('auth-submit-btn').textContent = 'Creating account...';
        }
    }

    openAuthModal() {
        this.isAuthModalOpen = true;
        // Hide buttons while the login popup is open
        this.hideButtonContainer();
        document.getElementById('auth-modal-backdrop').classList.add('is-visible');
        document.getElementById('auth-modal-backdrop').setAttribute('aria-hidden', 'false');
        document.getElementById('auth-form').reset();
        this.setAuthMode('login');
        this.syncBodyUiState();

        if (!this.isFirebaseConfigured()) {
            this.setAuthStatus(config.auth.copy.firebaseMissing, 'error');
        }

        window.requestAnimationFrame(() => {
            document.getElementById('auth-email').focus();
        });
    }

    closeAuthModal({ resetForm = false } = {}) {
        this.isAuthModalOpen = false;
        document.getElementById('auth-modal-backdrop').classList.remove('is-visible');
        document.getElementById('auth-modal-backdrop').setAttribute('aria-hidden', 'true');
        this.syncBodyUiState();

        if (resetForm) {
            document.getElementById('auth-form').reset();
            this.setAuthMode('login');
        }

        this.setAuthPendingState(false);

        if (this.isMenuMode) {
            this.showButtonContainer();

            // If the user closed without completing login, reset to a clean menu state:
            // camera returns to its default position and model resumes spinning.
            if (!this.isAuthenticated) {
                this.startCameraTransition(
                    config.camera.initialPosition,
                    config.camera.returnDuration
                );
                this.isModelRotationStopped = false;
                this.modelRotationReset = null;
                this.modelLerpAnimation = null;
            }
        }
    }

    async submitAuthForm() {
        if (this.authMode === 'register') {
            await this.registerWithEmail();
        } else {
            await this.signInWithEmail();
        }
    }

    async registerWithEmail() {
        const email = this.normalizeEmail(document.getElementById('auth-email').value);
        const password = document.getElementById('auth-password').value;
        const emailError = this.getEmailValidationMessage(email);
        const passwordError = this.getPasswordValidationMessage(password);

        if (emailError) {
            this.setAuthStatus(emailError, 'error');
            return;
        }
        if (passwordError) {
            this.setAuthStatus(passwordError, 'error');
            return;
        }
        if (!this.firebaseAuth) {
            this.setAuthStatus(config.auth.copy.firebaseMissing, 'error');
            return;
        }

        this.setAuthPendingState(true, 'register');

        try {
            const cred = await createUserWithEmailAndPassword(
                this.firebaseAuth,
                email,
                password
            );
            await sendEmailVerification(cred.user);
            await signOut(this.firebaseAuth);
            this.setAuthMode('login');
            document.getElementById('auth-password').value = '';
            this.setAuthStatus(config.auth.copy.registerSuccess, 'success');
        } catch (error) {
            this.setAuthStatus(this.getAuthErrorMessage(error), 'error');
        } finally {
            this.setAuthPendingState(false);
        }
    }

    async signInWithEmail() {
        const email = this.normalizeEmail(document.getElementById('auth-email').value);
        const password = document.getElementById('auth-password').value;
        const emailError = this.getEmailValidationMessage(email);
        const passwordError = this.getPasswordValidationMessage(password);

        if (emailError) {
            this.setAuthStatus(emailError, 'error');
            return;
        }
        if (passwordError) {
            this.setAuthStatus(passwordError, 'error');
            return;
        }
        if (!this.firebaseAuth) {
            this.setAuthStatus(config.auth.copy.firebaseMissing, 'error');
            return;
        }

        this.setAuthPendingState(true, 'login');

        try {
            await signInWithEmailAndPassword(
                this.firebaseAuth,
                email,
                password
            );
            this.closeAuthModal({ resetForm: true });
            this.clearAuthStatus();
            this.enterExperience();
        } catch (error) {
            this.setAuthStatus(this.getAuthErrorMessage(error), 'error');
        } finally {
            this.setAuthPendingState(false);
        }
    }

    // ─── Memory dialog ────────────────────────────────────────────────────────

    openMemoryDialog() {
        if (this.isLocked) {
            document.exitPointerLock();
        }
        this.isMemoryDialogOpen = true;
        document.getElementById('memory-dialog-backdrop').classList.add('is-visible');
        document.getElementById('memory-dialog-backdrop').setAttribute('aria-hidden', 'false');
        if (this.isMobile) {
            // Hide the entire mobile-controls overlay so it doesn't sit on top of
            // the dialog (mobile-controls is a body-level z-index:4 div — higher
            // than the overlay stacking context that the dialog lives in).
            const mobileControls = document.getElementById('mobile-controls');
            if (mobileControls) mobileControls.classList.remove('is-visible');
        }
        document.getElementById('memory-form').reset();
        document.getElementById('memory-image-preview').hidden = true;
        document.getElementById('memory-image-preview').src = '';
        document.getElementById('memory-image-label-text').textContent = 'Choose a photo *';
        // On mobile the modal only collects the data; actual placement is a separate step
        document.getElementById('memory-submit-btn').textContent = this.isMobile ? 'Save Memory' : 'Place Memory';
        this.clearMemoryStatus();
        this.syncBodyUiState();
        // Only auto-focus on desktop — on mobile this fires the virtual keyboard immediately
        if (!this.isMobile) {
            window.requestAnimationFrame(() => {
                document.getElementById('memory-description').focus();
            });
        }
    }

    closeMemoryDialog() {
        this.isMemoryDialogOpen = false;
        document.getElementById('memory-dialog-backdrop').classList.remove('is-visible');
        document.getElementById('memory-dialog-backdrop').setAttribute('aria-hidden', 'true');
        if (this.isMobile) {
            // Restore the mobile controls overlay if we're still in explore mode
            if (this.isExploring) {
                const mobileControls = document.getElementById('mobile-controls');
                if (mobileControls) mobileControls.classList.add('is-visible');
            }
        }
        document.getElementById('memory-form').reset();
        document.getElementById('memory-image-preview').hidden = true;
        document.getElementById('memory-image-preview').src = '';
        document.getElementById('memory-image-label-text').textContent = 'Choose a photo *';
        this.clearMemoryStatus();
        this.setMemorySubmitPending(false);
        this.syncBodyUiState();
    }

    clearMemoryStatus() {
        const el = document.getElementById('memory-status');
        el.textContent = '';
        delete el.dataset.state;
    }

    setMemoryStatus(message, state = 'info') {
        const el = document.getElementById('memory-status');
        el.textContent = message;
        el.dataset.state = state;
    }

    setMemorySubmitPending(isPending) {
        this.isMemorySubmitPending = isPending;
        const btn = document.getElementById('memory-submit-btn');
        const fileInput = document.getElementById('memory-image');
        const descInput = document.getElementById('memory-description');
        btn.disabled = isPending;
        fileInput.disabled = isPending;
        descInput.disabled = isPending;
        btn.textContent = isPending
            ? (this.isMobile ? 'Saving…' : 'Placing…')
            : (this.isMobile ? 'Save Memory' : 'Place Memory');
    }

    async submitMemory() {
        if (this.isMemorySubmitPending) return;

        const description = document.getElementById('memory-description').value.trim();
        if (!description) {
            this.setMemoryStatus('Please add a description.', 'error');
            return;
        }

        const file = document.getElementById('memory-image').files[0] || null;
        if (!file) {
            this.setMemoryStatus('Please choose a photo.', 'error');
            return;
        }

        if (!this.firestoreDb) {
            this.setMemoryStatus('Firebase is not configured — cannot save memories.', 'error');
            return;
        }

        // ── Mobile two-step flow ──────────────────────────────────────────────
        // Step 1: collect data, close the modal, show the preview thumbnail.
        // The orb is placed later when the user taps "Place Memory".
        if (this.isMobile) {
            // iOS Safari can invalidate a File reference after form.reset() is called
            // inside closeMemoryDialog. Clone to a stable File from an ArrayBuffer first.
            let stableFile = file;
            try {
                const buffer = await file.arrayBuffer();
                stableFile = new File([buffer], file.name, { type: file.type });
            } catch (_) {
                // fallback: keep original reference
            }
            this.pendingMemory = { file: stableFile, description };
            this.closeMemoryDialog();
            this.updateMobilePendingUI();
            // Lock controls so the user is immediately back in FPS mode
            if (this.isExploring) this.mobileLock();
            return;
        }

        // ── Desktop: upload + place immediately ───────────────────────────────
        this.setMemorySubmitPending(true);
        try {
            await this.uploadAndPlaceMemory({ file, description });
            this.closeMemoryDialog();
        } catch (error) {
            console.error('submitMemory error:', error);
            this.setMemoryStatus('Could not save memory — try again.', 'error');
        } finally {
            this.setMemorySubmitPending(false);
        }
    }

    // Shared upload + Firestore save + 3D spawn — used by both desktop and mobile placement.
    async uploadAndPlaceMemory({ file, description }) {
        // Compute spawn position: directly in front of the player in XZ
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const anchor = this.getCameraAnchor().position;
        const spawnPos = {
            x: anchor.x + forward.x * config.memories.spawnDistance,
            z: anchor.z + forward.z * config.memories.spawnDistance
        };

        // Upload image
        let imageUrl = null;
        if (file && this.firebaseStorage) {
            const uid = this.firebaseAuth.currentUser.uid;
            const path = `${config.memories.storagePath}/${uid}/${Date.now()}_${file.name}`;
            const sRef = storageRef(this.firebaseStorage, path);
            await uploadBytes(sRef, file);
            imageUrl = await getDownloadURL(sRef);
        }

        const userEmail = this.firebaseAuth.currentUser.email || '';
        const userName = this.extractDisplayName(userEmail);

        const docRef = await addDoc(
            collection(this.firestoreDb, config.memories.firestoreCollection),
            {
                userId: this.firebaseAuth.currentUser.uid,
                userName,
                description,
                imageUrl,
                position: spawnPos,
                createdAt: new Date().toISOString()
            }
        );

        this.createMemoryObjects({ id: docRef.id, description, imageUrl, position: spawnPos, userName });
    }

    // Mobile step 2: place the pending orb at the current player position.
    async placePendingMemory() {
        if (!this.pendingMemory || this.isMemorySubmitPending) return;
        this.isMemorySubmitPending = true;
        const btn = document.getElementById('mobile-memory-btn');
        if (btn) btn.textContent = 'Placing…';
        try {
            await this.uploadAndPlaceMemory(this.pendingMemory);
            this.pendingMemory = null;
            this.updateMobilePendingUI();
        } catch (error) {
            console.error('placePendingMemory error:', error);
        } finally {
            this.isMemorySubmitPending = false;
            this.updateMobilePendingUI();
        }
    }

    // Sync the mobile action bar to reflect pending state.
    updateMobilePendingUI() {
        const btn = document.getElementById('mobile-memory-btn');
        const preview = document.getElementById('mobile-pending-preview');
        if (!btn || !preview) return;

        if (this.pendingMemory) {
            btn.textContent = 'Place Memory';
            // Show thumbnail from the locally selected file
            const url = URL.createObjectURL(this.pendingMemory.file);
            preview.src = url;
            preview.hidden = false;
        } else {
            btn.textContent = 'Add Memory';
            preview.hidden = true;
            preview.src = '';
        }
    }

    // ─── Memory scene objects ─────────────────────────────────────────────────

    createMemoryObjects({ id, description, imageUrl, position, userName = 'Test User' }) {
        const hMin = Math.min(config.memories.orbHeightMin, config.memories.orbHeightMax);
        const hMax = Math.max(config.memories.orbHeightMin, config.memories.orbHeightMax);
        const orbY = hMin + Math.random() * (hMax - hMin);
        const pos = new THREE.Vector3(position.x, orbY, position.z);

        // Pick a random orb colour from the palette on each creation
        const orbPalette = [0x252a60, 0xf68722, 0xb72f26];
        const randomOrbColor = orbPalette[Math.floor(Math.random() * orbPalette.length)];

        const orbGeo = new THREE.SphereGeometry(config.memories.orbRadius, 18, 12);
        const orbMat = new THREE.MeshStandardMaterial({
            color: randomOrbColor,
            emissive: randomOrbColor,
            emissiveIntensity: 0.35,
            transparent: true,
            opacity: 1
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.copy(pos);
        this.scene.add(orb);

        // Image plane — starts invisible (opacity 0); fades in on proximity
        const planeGeo = new THREE.PlaneGeometry(config.memories.planeHeight, config.memories.planeHeight);
        let planeMat;
        if (imageUrl) {
            const texLoader = new THREE.TextureLoader();
            texLoader.crossOrigin = 'anonymous';
            const texture = texLoader.load(
                imageUrl,
                (tex) => {
                    // Resize geometry to match the image's actual aspect ratio
                    const aspect = tex.image.width / tex.image.height;
                    plane.geometry.dispose();
                    plane.geometry = new THREE.PlaneGeometry(
                        config.memories.planeHeight * aspect,
                        config.memories.planeHeight
                    );
                    tex.needsUpdate = true;
                },
                undefined,
                (err) => { console.error('Memory texture failed to load:', err); }
            );
            planeMat = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0
            });
        } else {
            planeMat = new THREE.MeshBasicMaterial({
                color: 0xdddddd,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0
            });
        }
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.position.copy(pos);
        this.scene.add(plane);

        this.memories.push({ id, description, imageUrl, userName, position: pos, orb, plane, isNear: false });
    }

    // ─── Proximity detection ──────────────────────────────────────────────────

    updateMemoryProximity(delta) {
        // Only active while pointer-locked in explore mode
        if (!this.isExploring || !this.isLocked || this.memories.length === 0) return;

        const fadeStep = delta / config.memories.planeFadeDuration;

        // Cast ray from camera centre forward (used only for activation)
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const orbMeshes = this.memories.filter(m => m.orb.visible || m.isNear).map(m => m.orb);
        const intersects = orbMeshes.length > 0
            ? this.raycaster.intersectObjects(orbMeshes)
            : [];
        const hitOrb = intersects.length > 0 ? intersects[0].object : null;

        const anchor = this.getCameraAnchor().position;
        let activeMemory = null;

        for (const memory of this.memories) {
            const dx = anchor.x - memory.position.x;
            const dz = anchor.z - memory.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const isInRange = dist < config.memories.proximityDistance;

            // Activate: raycaster hits this orb AND player is close enough
            if (!memory.isNear && memory.orb === hitOrb && isInRange) {
                memory.isNear = true;
            }
            // Deactivate: player walked out of range (ignores where camera is pointing)
            if (memory.isNear && !isInRange) {
                memory.isNear = false;
            }

            if (memory.isNear) {
                memory.plane.material.opacity = Math.min(1, memory.plane.material.opacity + fadeStep);
                // Keep plane facing the player
                memory.plane.rotation.y = Math.atan2(dx, dz);
                activeMemory = memory;
            } else {
                memory.plane.material.opacity = Math.max(0, memory.plane.material.opacity - fadeStep);
            }

            // Orb crossfades inversely with the plane
            memory.orb.material.opacity = 1 - memory.plane.material.opacity;
            memory.orb.visible   = memory.orb.material.opacity   > 0;
            memory.plane.visible = memory.plane.material.opacity > 0;
        }

        if (activeMemory) {
            this.showMemoryPopup(activeMemory.description, activeMemory.userName);
        } else {
            this.hideMemoryPopup();
        }
    }

    updateOrbPulse(timestamp) {
        if (!this.isExploring || this.memories.length === 0) return;
        const t = timestamp / 1000;
        for (let i = 0; i < this.memories.length; i++) {
            const memory = this.memories[i];
            if (!memory.orb.visible) continue;
            // Each orb gets its own phase so they pulse independently
            const phase = (i / this.memories.length) * Math.PI * 2;
            const sine = (Math.sin(t * config.memories.orbPulseSpeed * Math.PI * 2 + phase) + 1) / 2;
            memory.orb.material.emissiveIntensity = THREE.MathUtils.lerp(
                config.memories.orbPulseMin,
                config.memories.orbPulseMax,
                sine
            );
        }
    }

    // Derive "Firstname Lastname" from emails like aditya.de2024@bitsdesign.edu.in
    extractDisplayName(email) {
        if (!email) return '';
        try {
            const local = email.split('@')[0];           // "aditya.de2024"
            const stripped = local.replace(/\d+$/, ''); // "aditya.de"
            return stripped
                .split('.')
                .map(p => p.charAt(0).toUpperCase() + p.slice(1))
                .join(' ');                              // "Aditya De"
        } catch {
            return '';
        }
    }

    showMemoryPopup(description, userName) {
        document.getElementById('memory-popup-text').textContent = description;
        const nameEl = document.getElementById('memory-popup-name');
        if (userName) {
            nameEl.textContent = userName;
            nameEl.classList.add('has-name');
        } else {
            nameEl.textContent = '';
            nameEl.classList.remove('has-name');
        }
        document.getElementById('memory-popup').classList.add('is-visible');
    }

    hideMemoryPopup() {
        document.getElementById('memory-popup').classList.remove('is-visible');
    }

    // ─── Load memories from Firestore ─────────────────────────────────────────

    async loadMemoriesFromFirestore() {
        if (!this.firestoreDb) return;
        try {
            const snapshot = await getDocs(
                collection(this.firestoreDb, config.memories.firestoreCollection)
            );
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.position) {
                    this.createMemoryObjects({
                        id: doc.id,
                        description: data.description || '',
                        imageUrl: data.imageUrl || null,
                        position: data.position,
                        userName: data.userName || 'Test User'
                    });
                }
            });
        } catch (error) {
            console.error('loadMemoriesFromFirestore error:', error);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    getAuthErrorMessage(error) {
        if (!error) {
            return 'Something went wrong.';
        }

        const code = error.code;
        if (code === 'auth/email-already-in-use') {
            return 'This email is already registered. Switch to “Login to existing profile” and sign in, or use another email.';
        }
        if (code === 'auth/invalid-email') {
            return 'That email address does not look valid.';
        }
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
            return 'Incorrect email or password. Try again.';
        }
        if (code === 'auth/user-not-found') {
            return 'No account for that email. Use “logging in for the first time?” to register.';
        }
        if (code === 'auth/weak-password') {
            return 'Password is too weak. Use at least 6 characters.';
        }
        if (code === 'auth/too-many-requests') {
            return 'Too many attempts. Try again in a few minutes.';
        }
        if (code === 'auth/network-request-failed') {
            return 'Network error. Check your connection and try again.';
        }
        if (code === 'auth/user-disabled') {
            return 'This account is disabled. Contact the organizers if you think this is a mistake.';
        }

        if (typeof error.details === 'string') {
            return error.details;
        }

        if (error.details && typeof error.details.message === 'string') {
            return error.details.message;
        }

        if (error.message && !/^Firebase:/.test(error.message)) {
            return error.message;
        }

        return config.auth.copy.loginFailed;
    }

    enterExperience() {
        console.log('[Explore] user logged in:', this.isAuthenticated, '| uid:', this.firebaseAuth?.currentUser?.uid ?? 'none');
        this.triggerSequenceStartTime = null;
        this.modelLerpAnimation = null;
        this.cameraRotationReset = null;
        // Restore orbs and reset planes for a clean explore entry
        for (const memory of this.memories) {
            memory.orb.material.opacity = 1;
            memory.orb.visible = true;
            memory.plane.material.opacity = 0;
            memory.plane.visible = false;
            memory.isNear = false;
        }
        if (this.model) {
            this.model.position.set(
                config.model.finalPosition.x,
                config.model.finalPosition.y,
                config.model.finalPosition.z
            );
        }
        this.hasScrollTriggerFired = true;
        this.hasTriggerSequenceCompleted = true;
        this.isMenuMode = false;
        this.isExploring = true;
        this.isReturningFromExplore = false;
        this.enteredAsLoggedIn = this.isAuthenticated; // must be set before showMobileExploreUI reads it
        this.hideButtonContainer();
        this.startCameraTransition(config.camera.panPosition, config.camera.panDuration);
        if (this.isMobile) {
            this.showMobileExploreUI();
        }
        this.hasExplored = true;
        this.updateInstructionsText();
        document.getElementById('instructions').style.opacity = '1';

        if (!this.memoriesLoaded) {
            this.memoriesLoaded = true;
            this.loadMemoriesFromFirestore();
        }
    }

    // ─── Explore return flow ──────────────────────────────────────────────────

    startModelLerp(targetY, duration) {
        if (!this.model) return;
        this.modelLerpAnimation = {
            startTime: performance.now(),
            duration,
            fromY: this.model.position.y,
            toY: targetY
        };
    }

    returnFromExploreMode() {
        if (!this.isExploring) return;
        this.isExploring = false;
        this.isReturningFromExplore = true;
        this.isMenuMode = false;
        this.hideButtonContainer();
        // Hide all memory orbs and planes immediately
        for (const memory of this.memories) {
            memory.orb.material.opacity = 0;
            memory.orb.visible = false;
            memory.plane.material.opacity = 0;
            memory.plane.visible = false;
            memory.isNear = false;
        }
        this.hideMemoryPopup();
        // Lerp model back down to initial (hidden) position
        this.startModelLerp(config.model.initialPosition.y, config.model.returnDuration);
        // Lerp camera position back to default
        this.startCameraTransition(config.camera.initialPosition, config.camera.returnDuration);
        // Lerp camera rotation (yaw + pitch) back to forward-facing
        this.startCameraRotationReset(config.camera.returnDuration);
        document.getElementById('instructions').style.opacity = '0';
        if (this.isMobile) this.hideMobileExploreUI();
    }

    startCameraRotationReset(duration) {
        this.cameraRotationReset = {
            startTime: performance.now(),
            duration,
            fromYaw: this.controls.getObject().rotation.y,
            fromPitch: this.camera.rotation.x
        };
    }

    updateCameraRotationReset(timestamp) {
        if (!this.cameraRotationReset || this.isLocked) return;

        const progress = this.getTimedProgress(
            timestamp,
            this.cameraRotationReset.startTime,
            this.cameraRotationReset.duration
        );
        const eased = this.easeInOutCubic(progress);

        this.controls.getObject().rotation.y = THREE.MathUtils.lerp(
            this.cameraRotationReset.fromYaw, 0, eased
        );
        this.camera.rotation.x = THREE.MathUtils.lerp(
            this.cameraRotationReset.fromPitch, 0, eased
        );

        if (progress >= 1) {
            this.controls.getObject().rotation.y = 0;
            this.camera.rotation.x = 0;
            this.cameraRotationReset = null;
        }
    }

    enterMenuModeFromReturn() {
        if (!this.isReturningFromExplore) return;
        this.isReturningFromExplore = false;
        this.isMenuMode = true;
        this.isModelRotationStopped = false;
        this.modelRotationReset = null;
        // Lerp model back up to final position
        this.startModelLerp(config.model.finalPosition.y, config.model.settleDuration);
        // Camera is already back at initialPosition; show buttons immediately
        this.showButtonContainer();
        if (this.isMobile) this.hideMobileExploreUI();
    }

    setMenuMode(isVisible) {
        if (this.isMenuMode === isVisible) {
            return;
        }

        this.isMenuMode = isVisible;

        if (isVisible) {
            this.showButtonContainer();
            this.startCameraTransition(config.camera.initialPosition, config.camera.returnDuration);
        } else {
            this.hideButtonContainer();
        }
    }

    getSectionHeight() {
        return window.innerHeight;
    }

    getScrollProgress(startSection, endSection) {
        const startScroll = startSection * this.getSectionHeight();
        const endScroll = endSection * this.getSectionHeight();

        if (endScroll === startScroll) {
            return this.scrollY >= endScroll ? 1 : 0;
        }

        return Math.min(1, Math.max(0,
            (this.scrollY - startScroll) / (endScroll - startScroll)
        ));
    }

    isInFirstSection() {
        return this.scrollY < (config.scroll.indicatorEndSection * this.getSectionHeight());
    }

    isNearBottomMenuZone() {
        return this.scrollY >= (config.scroll.menuReturnStartSection * this.getSectionHeight());
    }

    getHeaderFadeProgress() {
        return this.getScrollProgress(
            config.text.header.fadeStartSection,
            config.text.header.fadeEndSection
        );
    }

    startCameraTransition(targetPosition, duration) {
        const object = this.getCameraAnchor();
        const target = new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z);

        if (object.position.distanceTo(target) < 0.001) {
            object.position.copy(target);
            this.cameraTransition = null;
            return;
        }

        this.cameraTransition = {
            startTime: performance.now(),
            duration,
            from: object.position.clone(),
            to: target
        };
    }

    updateCameraTransition(timestamp) {
        if (!this.cameraTransition) {
            return;
        }

        const progress = this.getTimedProgress(
            timestamp,
            this.cameraTransition.startTime,
            this.cameraTransition.duration
        );
        const easedProgress = this.easeInOutCubic(progress);
        this.getCameraAnchor().position.lerpVectors(
            this.cameraTransition.from,
            this.cameraTransition.to,
            easedProgress
        );

        if (progress >= 1) {
            this.cameraTransition = null;
        }
    }

    startModelRotationReset(duration) {
        if (!this.model) {
            return;
        }

        this.modelRotationReset = {
            startTime: performance.now(),
            duration,
            fromY: this.model.rotation.y,
            toY: this.modelDefaultRotationY
        };
    }

    stopModelRotation() {
        if (this.isModelRotationStopped) {
            return;
        }

        this.isModelRotationStopped = true;
        this.startModelRotationReset(config.model.rotationResetDuration);
    }

    updateModelIdleAnimation(delta, timestamp) {
        if (!this.model) {
            return;
        }

        // Lerp model position Y (explore return / re-enter menu)
        if (this.modelLerpAnimation) {
            const progress = this.getTimedProgress(
                timestamp,
                this.modelLerpAnimation.startTime,
                this.modelLerpAnimation.duration
            );
            this.model.position.y = THREE.MathUtils.lerp(
                this.modelLerpAnimation.fromY,
                this.modelLerpAnimation.toY,
                this.easeInOutCubic(progress)
            );
            if (progress >= 1) {
                this.model.position.y = this.modelLerpAnimation.toY;
                this.modelLerpAnimation = null;
            }
        }

        if (this.modelRotationReset) {
            const progress = this.getTimedProgress(
                timestamp,
                this.modelRotationReset.startTime,
                this.modelRotationReset.duration
            );
            this.model.rotation.y = THREE.MathUtils.lerp(
                this.modelRotationReset.fromY,
                this.modelRotationReset.toY,
                this.easeOutCubic(progress)
            );

            if (progress >= 1) {
                this.model.rotation.y = this.modelRotationReset.toY;
                this.modelRotationReset = null;
            }

            return;
        }

        if (!this.isModelRotationStopped) {
            this.model.rotation.y = (this.model.rotation.y + config.model.rotationSpeed * delta) % (Math.PI * 2);
        }
    }

    updateUnlockedScrollState(scrollDelta) {
        if (this.isLocked || this.isAuthModalOpen) {
            return;
        }

        // Scroll up while actively exploring → begin return sequence
        if (this.isExploring && scrollDelta < 0) {
            this.returnFromExploreMode();
            return;
        }

        // Scroll down after having returned from explore → go back to menu (buttons + model)
        if (this.isReturningFromExplore && scrollDelta > 0) {
            this.enterMenuModeFromReturn();
            return;
        }
    }

    resetScrollTriggerIfNeeded() {
        if (this.scrollY <= config.scroll.resetTopThreshold) {
            this.hasScrollTriggerFired = false;
            this.triggerSequenceStartTime = null;
            this.autoScrollStartY = null;
            this.autoScrollTargetY = 0;
            this.hasTriggerSequenceCompleted = false;
            this.cameraTransition = null;
            this.cameraRotationReset = null;
            this.modelRotationReset = null;
            this.modelLerpAnimation = null;
            this.hasExplored = false;
            this.isExploring = false;
            this.isReturningFromExplore = false;
            this.isModelRotationStopped = false;
            if (this.isMobile) this.hideMobileExploreUI();
            this.applySequenceInitialState();
            this.closeAuthModal({ resetForm: true });
            document.getElementById('instructions').style.opacity = '0';
            this.getCameraAnchor().position.set(
                config.camera.initialPosition.x,
                config.camera.initialPosition.y,
                config.camera.initialPosition.z
            );
        }
    }

    updateScrollIndicatorVisibility() {
        if (!this.isScrollIndicatorReady || this.hasScrollTriggerFired) {
            this.hideScrollIndicator();
            return;
        }

        if (this.isInFirstSection()) {
            this.showScrollIndicator();
        } else {
            this.hideScrollIndicator();
        }
    }

    setupEventListeners() {
        // Scroll event
        window.addEventListener('scroll', () => this.onScroll());

        // Scroll indicator
        const scrollIndicator = document.getElementById('scroll-indicator');
        scrollIndicator.addEventListener('click', () => this.scrollToBottom());
        scrollIndicator.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.scrollToBottom();
            }
        });

        // Button events
        document.getElementById('explore-btn').addEventListener('click', () => this.onExplore());
        document.getElementById('login-btn').addEventListener('click', () => this.onLogin());

        // Auth modal events
        document.getElementById('auth-form').addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitAuthForm();
        });
        document.getElementById('auth-mode-toggle').addEventListener('click', () => {
            this.setAuthMode(this.authMode === 'login' ? 'register' : 'login');
        });
        document.getElementById('auth-modal-close').addEventListener('click', () => {
            this.closeAuthModal({ resetForm: true });
        });
        document.getElementById('auth-modal-backdrop').addEventListener('click', (event) => {
            if (event.target.id === 'auth-modal-backdrop') {
                this.closeAuthModal({ resetForm: true });
            }
        });

        // Memory dialog events
        document.getElementById('memory-form').addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitMemory();
        });
        document.getElementById('memory-dialog-close').addEventListener('click', () => {
            this.closeMemoryDialog();
        });
        document.getElementById('memory-dialog-backdrop').addEventListener('click', (event) => {
            if (event.target.id === 'memory-dialog-backdrop') {
                this.closeMemoryDialog();
            }
        });
        document.getElementById('memory-image').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('memory-image-preview');
                preview.src = e.target.result;
                preview.hidden = false;
                document.getElementById('memory-image-label-text').textContent = file.name;
            };
            reader.readAsDataURL(file);
        });

        // Keyboard events
        document.addEventListener('keydown', (event) => this.onKeyDown(event));
        document.addEventListener('keyup', (event) => this.onKeyUp(event));
        window.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
        window.addEventListener('touchmove', (event) => this.onTouchMove(event), { passive: false });

        // Pointer lock events
        document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
        document.addEventListener('pointerlockerror', () => this.onPointerLockError());

        // Mobile-specific setup
        if (this.isMobile) {
            this.initMobileControls();
        }
    }

    onScroll() {
        if (this.isLocked || this.isAuthModalOpen || this.isMemoryDialogOpen) {
            if (window.scrollY !== this.scrollY) {
                window.scrollTo(0, this.scrollY);
            }
            return;
        }

        this.previousScrollY = this.scrollY;
        this.scrollY = window.scrollY;
        this.resetScrollTriggerIfNeeded();
        this.updateScrollAnimations();
        this.updateScrollIndicatorVisibility();
        this.handleScrollTrigger();
        this.updateUnlockedScrollState(this.scrollY - this.previousScrollY);
    }

    onWheel(event) {
        if (this.isLocked || this.isAuthModalOpen || this.isMemoryDialogOpen) {
            event.preventDefault();
        }
    }

    onTouchMove(event) {
        if (this.isLocked) {
            event.preventDefault();
            return;
        }
        // When a modal is open, allow touchmove inside the scrollable modal box
        // but still block it on the background to prevent page scroll-behind.
        if (this.isAuthModalOpen || this.isMemoryDialogOpen) {
            const authModal = document.getElementById('auth-modal');
            const memDialog = document.getElementById('memory-dialog');
            if ((authModal && authModal.contains(event.target)) ||
                (memDialog && memDialog.contains(event.target))) {
                return; // let the browser scroll inside the modal naturally
            }
            event.preventDefault();
            return;
        }
        // Block page scroll while exploring on mobile (locked OR unlocked) —
        // the exit button is the only escape route when no modal is open.
        if (this.isMobile && this.isExploring) {
            event.preventDefault();
            return;
        }
    }

    updateScrollAnimations() {
        // Scroll only drives the title exit in section 1.
        const headerContainer = document.getElementById('header-container');
        const translateProgress = this.getScrollProgress(0, config.text.translateEndSection);
        const fadeProgress = this.getHeaderFadeProgress();
        const translateY = window.innerHeight * config.text.scrollTranslateViewportRatio * translateProgress;
        headerContainer.style.transform = `translate3d(0, ${translateY}px, 0)`;
        headerContainer.style.opacity = `${1 - fadeProgress}`;
    }

    handleScrollTrigger() {
        if (this.hasScrollTriggerFired) {
            return;
        }

        if (this.getHeaderFadeProgress() >= config.scroll.triggerHeaderFadeProgress) {
            this.scrollToBottom();
        }
    }

    easeInOutCubic(progress) {
        return progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    }

    easeOutCubic(progress) {
        return 1 - Math.pow(1 - progress, 3);
    }

    getTimedProgress(timestamp, startTime, duration) {
        if (startTime === null) {
            return 0;
        }

        return Math.min(1, Math.max(0, (timestamp - startTime) / duration));
    }

    updateTriggeredSequence(timestamp) {
        if (!this.hasScrollTriggerFired || this.triggerSequenceStartTime === null) {
            return;
        }

        if (timestamp < this.triggerSequenceStartTime) {
            return;
        }

        if (this.autoScrollStartY === null && timestamp >= this.triggerSequenceStartTime) {
            this.autoScrollStartY = window.scrollY;
            this.autoScrollTargetY = document.documentElement.scrollHeight - window.innerHeight;
        }

        if (this.autoScrollStartY !== null) {
            const autoScrollProgress = this.getTimedProgress(
                timestamp,
                this.triggerSequenceStartTime,
                config.scroll.autoScrollDuration
            );
            if (autoScrollProgress < 1) {
                const nextScrollY = THREE.MathUtils.lerp(
                    this.autoScrollStartY,
                    this.autoScrollTargetY,
                    this.easeInOutCubic(autoScrollProgress)
                );
                window.scrollTo(0, nextScrollY);
            }
        }

        if (this.model) {
            const modelProgress = this.getTimedProgress(
                timestamp,
                this.triggerSequenceStartTime,
                config.model.settleDuration
            );
            this.model.position.y = THREE.MathUtils.lerp(
                config.model.initialPosition.y,
                config.model.finalPosition.y,
                this.easeOutCubic(modelProgress)
            );
        }

        const buttonsStartTime =
            this.triggerSequenceStartTime +
            config.model.settleDuration +
            config.buttons.container.revealDelayAfterModel;
        const buttonProgress = this.getTimedProgress(
            timestamp,
            buttonsStartTime,
            config.buttons.container.revealDuration
        );
        const buttonContainer = document.getElementById('button-container');
        const buttonTranslateY =
            config.buttons.container.translateStartY * (1 - this.easeOutCubic(buttonProgress));
        buttonContainer.style.opacity = `${buttonProgress}`;
        buttonContainer.style.transform =
            `${config.buttons.container.position.transform} translateY(${buttonTranslateY}px)`;

        if (buttonProgress >= 1) {
            this.hasTriggerSequenceCompleted = true;
            this.triggerSequenceStartTime = null;
            this.showButtonContainer();
            this.setMenuMode(true);
        }
    }

    scrollToBottom() {
        this.hasScrollTriggerFired = true;
        this.hasTriggerSequenceCompleted = false;
        this.hideScrollIndicator();
        this.hideButtonContainer();
        this.isMenuMode = false;
        this.triggerSequenceStartTime = performance.now() + config.scroll.autoScrollDelay;
        this.autoScrollStartY = null;
        this.autoScrollTargetY = document.documentElement.scrollHeight - window.innerHeight;
    }

    onExplore() {
        this.closeAuthModal({ resetForm: true });
        this.stopModelRotation();
        this.enterExperience();
    }

    onLogin() {
        this.stopModelRotation();

        if (this.isAuthenticated) {
            this.enterExperience();
            return;
        }

        this.startCameraTransition(config.camera.initialPosition, config.camera.returnDuration);
        this.openAuthModal();
    }

    panCamera() {
        this.isPanning = true;
        this.panStartTime = Date.now();
        this.panDuration = config.camera.panDuration;
        this.startPosition = this.getCameraAnchor().position.clone();
        this.endPosition = new THREE.Vector3(
            config.camera.panPosition.x,
            config.camera.panPosition.y,
            config.camera.panPosition.z
        );
    }

    onKeyDown(event) {
        if (this.isMemoryDialogOpen) {
            if (event.code === 'Escape') {
                event.preventDefault();
                this.closeMemoryDialog();
            }
            return;
        }

        if (this.isAuthModalOpen) {
            if (event.code === 'Escape') {
                event.preventDefault();
                this.closeAuthModal({ resetForm: true });
            }
            return;
        }

        if (this.isLocked) {
            event.preventDefault();
        }

        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.moveState.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.moveState.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.moveState.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.moveState.right = true;
                break;
            default:
                break;
        }

        if (event.code === 'Space') {
            event.preventDefault();
            // Spacebar only toggles pointer lock while in explore mode
            if (this.isExploring) {
                this.togglePointerLock();
            }
        }

        if (event.code === 'KeyV' && this.enteredAsLoggedIn && this.hasExplored && !this.isAuthModalOpen) {
            event.preventDefault();
            this.openMemoryDialog();
        }
    }

    onKeyUp(event) {
        if (this.isAuthModalOpen) {
            return;
        }

        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.moveState.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.moveState.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.moveState.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.moveState.right = false;
                break;
            default:
                break;
        }
    }

    togglePointerLock() {
        if (this.isMobile || this.isAuthModalOpen) return;

        if (this.isLocked) {
            document.exitPointerLock();
        } else {
            document.body.requestPointerLock();
        }
    }

    onPointerLockChange() {
        this.isLocked = (document.pointerLockElement === document.body);
        this.syncBodyUiState();
        if (this.isLocked) {
            this.setMenuMode(false);
            window.scrollTo(0, this.scrollY);
            if (this.reticle) this.reticle.visible = true;
        } else {
            if (this.reticle) this.reticle.visible = false;
            // Reset all memory visuals when unlocking
            this.hideMemoryPopup();
            for (const memory of this.memories) {
                memory.plane.material.opacity = 0;
                memory.plane.visible = false;
                memory.orb.material.opacity = 1;
                memory.orb.visible = true;
                memory.isNear = false;
            }
            // Keep hint visible whenever we're still in explore mode
            if (this.isExploring) {
                document.getElementById('instructions').style.opacity = '1';
            }
        }
    }

    onPointerLockError() {
        console.error('Pointer lock failed');
    }

    // ─── Mobile controls ──────────────────────────────────────────────────────

    checkOrientation() {
        const popup = document.getElementById('portrait-popup');
        if (!popup) return;
        const isPortrait = window.innerHeight > window.innerWidth;
        popup.classList.toggle('is-visible', isPortrait);
    }

    initMobileControls() {
        // Portrait check now and on every orientation change
        this.checkOrientation();
        const onOrientationChange = () => setTimeout(() => this.checkOrientation(), 100);
        window.addEventListener('orientationchange', onOrientationChange);
        if (screen.orientation) {
            screen.orientation.addEventListener('change', onOrientationChange);
        }

        // Joysticks
        this.joystick1 = new JoystickController('stick1', 48, 8);
        this.joystick2 = new JoystickController('stick2', 48, 8);

        // Lock / Unlock button
        document.getElementById('mobile-lock-btn').addEventListener('click', () => {
            if (this.isLocked) this.mobileUnlock();
            else this.mobileLock();
        });

        // Exit button — returns to section 1 when controls are unlocked in explore mode
        document.getElementById('mobile-exit-btn').addEventListener('click', () => {
            this.returnFromExploreMode();
            window.scrollTo(0, 0);
        });

        // Memory button — behaviour depends on whether a pending memory exists
        document.getElementById('mobile-memory-btn').addEventListener('click', () => {
            if (this.pendingMemory) {
                // Step 2: place the orb at current position
                this.placePendingMemory();
            } else {
                // Step 1: open the form to collect photo + description
                if (this.isLocked) this.mobileUnlock();
                if (this.enteredAsLoggedIn) this.openMemoryDialog();
            }
        });
    }

    showMobileExploreUI() {
        document.getElementById('mobile-controls').classList.add('is-visible');
        const memBtn = document.getElementById('mobile-memory-btn');
        if (memBtn) memBtn.hidden = !this.enteredAsLoggedIn;
        // Exit button visible whenever controls are unlocked in explore mode
        const exitBtn = document.getElementById('mobile-exit-btn');
        if (exitBtn) exitBtn.hidden = false;
    }

    hideMobileExploreUI() {
        const controls = document.getElementById('mobile-controls');
        if (controls) controls.classList.remove('is-visible');
        if (this.isLocked) this.mobileUnlock();
        // Discard any unsaved pending memory when leaving explore mode
        if (this.pendingMemory) {
            this.pendingMemory = null;
            this.updateMobilePendingUI();
        }
    }

    mobileLock() {
        this.isLocked = true;
        this.syncBodyUiState();
        if (this.reticle) this.reticle.visible = true;
        document.getElementById('mobile-joysticks').classList.add('is-visible');
        document.getElementById('mobile-lock-btn').textContent = 'Unlock Controls';
        // Hide exit button while controls are locked (scroll is already blocked)
        const exitBtn = document.getElementById('mobile-exit-btn');
        if (exitBtn) exitBtn.hidden = true;
        window.scrollTo(0, this.scrollY);
    }

    mobileUnlock() {
        this.isLocked = false;
        this.syncBodyUiState();
        if (this.reticle) this.reticle.visible = false;
        document.getElementById('mobile-joysticks').classList.remove('is-visible');
        document.getElementById('mobile-lock-btn').textContent = 'Lock Controls';
        // Show exit button so user can leave explore mode
        const exitBtn = document.getElementById('mobile-exit-btn');
        if (exitBtn) exitBtn.hidden = false;
        this.hideMemoryPopup();
        for (const memory of this.memories) {
            memory.plane.material.opacity = 0;
            memory.plane.visible = false;
            memory.orb.material.opacity = 1;
            memory.orb.visible = true;
            memory.isNear = false;
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.updateScrollAnimations();
        this.updateScrollIndicatorVisibility();
    }

    animate(timestamp = performance.now()) {
        requestAnimationFrame((nextTimestamp) => this.animate(nextTimestamp));
        // Cap delta so that a long pause (e.g. iOS file picker) doesn't produce
        // a massive jump when requestAnimationFrame resumes.
        const delta = Math.min(this.clock.getDelta(), 0.1);

        // Handle camera panning
        if (this.isPanning) {
            const elapsed = Date.now() - this.panStartTime;
            const progress = Math.min(elapsed / this.panDuration, 1);
            this.getCameraAnchor().position.lerpVectors(this.startPosition, this.endPosition, progress);
            if (progress >= 1) {
                this.isPanning = false;
            }
        }

        this.updateCameraTransition(timestamp);

        if (this.isLocked) {
            const moveDistance = config.controls.moveSpeed * delta;
            if (this.moveState.forward) {
                this.controls.moveForward(moveDistance);
            }
            if (this.moveState.backward) {
                this.controls.moveForward(-moveDistance);
            }
            if (this.moveState.left) {
                this.controls.moveRight(-moveDistance);
            }
            if (this.moveState.right) {
                this.controls.moveRight(moveDistance);
            }
        }

        // Mobile joystick movement (left stick = move, right stick = look)
        if (this.isMobile && this.isLocked && this.joystick1 && this.joystick2) {
            const moveDistance = config.controls.moveSpeed * delta;
            const lookSens = config.controls.mobileLookSensitivity * delta;

            if (this.joystick1.value.y !== 0) {
                this.controls.moveForward(-this.joystick1.value.y * moveDistance);
            }
            if (this.joystick1.value.x !== 0) {
                this.controls.moveRight(this.joystick1.value.x * moveDistance);
            }

            this.controls.getObject().rotation.y -= this.joystick2.value.x * lookSens;
            this.camera.rotation.x -= this.joystick2.value.y * lookSens;
            this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
        }

        // Keep Y fixed for walking when locked
        if (this.isLocked) {
            this.controls.getObject().position.y = config.camera.panPosition.y;
        }

        this.updateTriggeredSequence(timestamp);
        this.updateModelIdleAnimation(delta, timestamp);
        this.updateCameraRotationReset(timestamp);
        this.updateMemoryProximity(delta);
        this.updateOrbPulse(timestamp);

        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the experience
new PowaiExperience();
