// app.js - Main Three.js application logic

import { config } from './config.js';
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
                this.modelDefaultRotationY = this.model.rotation.y;
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
        header.textContent = config.text.header.text;
        header.style.fontSize = config.text.header.fontSize;
        header.style.color = config.text.header.color;
        header.style.top = config.text.header.position.top;
        header.style.left = config.text.header.position.left;
        header.style.transform = config.text.header.position.transform;
        header.style.transitionDuration = `${config.intro.headerFadeDuration}ms`;

        // Sub-header
        const subHeader = document.getElementById('sub-header');
        subHeader.textContent = config.text.subHeader.text;
        subHeader.style.fontSize = config.text.subHeader.fontSize;
        subHeader.style.color = config.text.subHeader.color;
        subHeader.style.top = config.text.subHeader.position.top;
        subHeader.style.left = config.text.subHeader.position.left;
        subHeader.style.transform = config.text.subHeader.position.transform;
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
        instructions.style.right = config.instructions.position.right;
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
        buttonContainer.style.transform = `${config.buttons.container.position.transform} translateY(0px)`;
    }

    hideButtonContainer() {
        const buttonContainer = document.getElementById('button-container');
        buttonContainer.style.opacity = '0';
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
        });
    }

    updateInstructionsText() {
        const base = config.instructions.text;
        const extra = this.enteredAsLoggedIn ? '<br>V to add a memory' : '';
        document.getElementById('instructions').innerHTML = base + extra;
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
        document.getElementById('memory-form').reset();
        document.getElementById('memory-image-preview').hidden = true;
        document.getElementById('memory-image-preview').src = '';
        document.getElementById('memory-image-label-text').textContent = 'Choose a photo (optional)';
        this.clearMemoryStatus();
        this.syncBodyUiState();
        window.requestAnimationFrame(() => {
            document.getElementById('memory-description').focus();
        });
    }

    closeMemoryDialog() {
        this.isMemoryDialogOpen = false;
        document.getElementById('memory-dialog-backdrop').classList.remove('is-visible');
        document.getElementById('memory-dialog-backdrop').setAttribute('aria-hidden', 'true');
        document.getElementById('memory-form').reset();
        document.getElementById('memory-image-preview').hidden = true;
        document.getElementById('memory-image-preview').src = '';
        document.getElementById('memory-image-label-text').textContent = 'Choose a photo (optional)';
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
        btn.textContent = isPending ? 'Placing…' : 'Place Memory';
    }

    async submitMemory() {
        if (this.isMemorySubmitPending) return;

        const description = document.getElementById('memory-description').value.trim();
        if (!description) {
            this.setMemoryStatus('Please add a description.', 'error');
            return;
        }

        const file = document.getElementById('memory-image').files[0] || null;

        if (!this.firestoreDb) {
            this.setMemoryStatus('Firebase is not configured — cannot save memories.', 'error');
            return;
        }

        this.setMemorySubmitPending(true);

        try {
            // Compute spawn position: directly in front of the player in XZ
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
            const anchor = this.getCameraAnchor().position;
            const spawnPos = {
                x: anchor.x + forward.x * config.memories.spawnDistance,
                y: config.memories.orbHeight,
                z: anchor.z + forward.z * config.memories.spawnDistance
            };

            // Upload image if provided
            let imageUrl = null;
            if (file && this.firebaseStorage) {
                const uid = this.firebaseAuth.currentUser.uid;
                const path = `${config.memories.storagePath}/${uid}/${Date.now()}_${file.name}`;
                const sRef = storageRef(this.firebaseStorage, path);
                await uploadBytes(sRef, file);
                imageUrl = await getDownloadURL(sRef);
            }

            // Save to Firestore
            const docRef = await addDoc(
                collection(this.firestoreDb, config.memories.firestoreCollection),
                {
                    userId: this.firebaseAuth.currentUser.uid,
                    description,
                    imageUrl,
                    position: spawnPos,
                    createdAt: new Date().toISOString()
                }
            );

            // Create in 3D scene
            this.createMemoryObjects({ id: docRef.id, description, imageUrl, position: spawnPos });

            this.closeMemoryDialog();
        } catch (error) {
            console.error('submitMemory error:', error);
            this.setMemoryStatus('Could not save memory — try again.', 'error');
        } finally {
            this.setMemorySubmitPending(false);
        }
    }

    // ─── Memory scene objects ─────────────────────────────────────────────────

    createMemoryObjects({ id, description, imageUrl, position }) {
        // Always use config orbHeight for Y — changing the config repositions all memories
        const pos = new THREE.Vector3(position.x, config.memories.orbHeight, position.z);

        // Red orb
        const orbGeo = new THREE.SphereGeometry(config.memories.orbRadius, 18, 12);
        const orbMat = new THREE.MeshStandardMaterial({
            color: config.memories.orbColor,
            emissive: config.memories.orbColor,
            emissiveIntensity: 0.35
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.copy(pos);
        this.scene.add(orb);

        // Image plane
        const planeGeo = new THREE.PlaneGeometry(config.memories.planeWidth, config.memories.planeHeight);
        let planeMat;
        if (imageUrl) {
            const texLoader = new THREE.TextureLoader();
            texLoader.crossOrigin = 'anonymous';
            const texture = texLoader.load(
                imageUrl,
                (tex) => { tex.needsUpdate = true; },
                undefined,
                (err) => { console.error('Memory texture failed to load:', err); }
            );
            planeMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
        } else {
            planeMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, side: THREE.DoubleSide });
        }
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.position.copy(pos);
        plane.visible = false;
        this.scene.add(plane);

        this.memories.push({ id, description, imageUrl, position: pos, orb, plane, isNear: false });
    }

    // ─── Proximity detection ──────────────────────────────────────────────────

    updateMemoryProximity() {
        if (!this.hasExplored || this.memories.length === 0) return;

        const playerPos = this.getCameraAnchor().position;
        let closestMemory = null;
        let closestDist = Infinity;

        for (const memory of this.memories) {
            const dx = playerPos.x - memory.position.x;
            const dz = playerPos.z - memory.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const isNear = dist < config.memories.proximityDistance;

            if (isNear !== memory.isNear) {
                memory.isNear = isNear;
                memory.orb.visible = !isNear;
                memory.plane.visible = isNear;
            }

            if (isNear) {
                // Rotate plane to always face the player (Y axis only, stays upright)
                memory.plane.rotation.y = Math.atan2(dx, dz);

                if (dist < closestDist) {
                    closestDist = dist;
                    closestMemory = memory;
                }
            }
        }

        if (closestMemory) {
            this.showMemoryPopup(closestMemory.description);
        } else {
            this.hideMemoryPopup();
        }
    }

    showMemoryPopup(description) {
        document.getElementById('memory-popup-text').textContent = description;
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
                        position: data.position
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
        this.triggerSequenceStartTime = null;
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
        this.hideButtonContainer();
        this.startCameraTransition(config.camera.panPosition, config.camera.panDuration);
        document.getElementById('instructions').style.opacity = '1';
        this.hasExplored = true;
        this.enteredAsLoggedIn = this.isAuthenticated;
        this.updateInstructionsText();

        if (!this.memoriesLoaded) {
            this.memoriesLoaded = true;
            this.loadMemoriesFromFirestore();
        }
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
            this.model.rotation.y += config.model.rotationSpeed * delta;
        }
    }

    updateUnlockedScrollState(scrollDelta) {
        if (this.isLocked || this.isAuthModalOpen || !this.hasExplored || !this.hasTriggerSequenceCompleted) {
            return;
        }

        if (scrollDelta < 0) {
            document.getElementById('instructions').style.opacity = '0';
            this.setMenuMode(false);
            return;
        }

        if (scrollDelta > 0 && this.isNearBottomMenuZone()) {
            document.getElementById('instructions').style.opacity = '0';
            this.setMenuMode(true);
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
            this.modelRotationReset = null;
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
    }

    onScroll() {
        if (this.isLocked || this.isAuthModalOpen) {
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
        if (this.isLocked || this.isAuthModalOpen) {
            event.preventDefault();
        }
    }

    onTouchMove(event) {
        if (this.isLocked || this.isAuthModalOpen) {
            event.preventDefault();
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
            this.togglePointerLock();
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
        if (this.isAuthModalOpen) {
            return;
        }

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
            // Hide instructions when locked
            document.getElementById('instructions').style.opacity = '0';
            this.setMenuMode(false);
            window.scrollTo(0, this.scrollY);
        } else {
            // Show instructions when unlocked
            if (this.hasExplored) {
                document.getElementById('instructions').style.opacity = '1';
            }
        }
    }

    onPointerLockError() {
        console.error('Pointer lock failed');
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
        const delta = this.clock.getDelta();

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

        // Keep Y fixed for walking when locked
        if (this.isLocked) {
            this.controls.getObject().position.y = config.camera.panPosition.y;
        }

        this.updateTriggeredSequence(timestamp);
        this.updateModelIdleAnimation(delta, timestamp);
        this.updateMemoryProximity();

        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the experience
new PowaiExperience();
