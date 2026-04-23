// config.js - All configurable properties for the Three.js experience

export const config = {
    // Scene settings
    scene: {
        backgroundColor: 0xffffff, // White
        fog: {
            color: 0xffffff,
            near: 1,
            far: 1000
        }
    },

    // Camera settings
    camera: {
        fov: 75,
        near: 0.1,
        far: 1000,
        initialPosition: { x: 0, y: 5, z: 10 },
        panPosition: { x: -2, y: 5, z: 0 }, // Position after explore button press
        panDuration: 2000, // ms
        returnDuration: 1200
    },

    // Lighting
    lights: {
        ambient: {
            color: 0xffffff,
            intensity: 0.8
        },
        directional: {
            color: 0xffffff,
            intensity: 0.8,
            position: { x: -10, y: 10, z: 5 }
        }
    },

    // Text overlay settings
    text: {
        header: {
            text: "POWAI",
            fontSize: "8rem",
            color: "#262626",
            position: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
            fadeStartSection: 0,
            fadeEndSection: 0.3
        },
        subHeader: {
            text: "year 1",
            fontSize: "4rem",
            color: "#383838",
            position: { top: "58%", left: "50%", transform: "translate(-50%, -50%)" },
            fadeStartSection: 0,
            fadeEndSection: 0.3
        },
        translateEndSection: 1,
        scrollTranslateViewportRatio: -0.72
    },

    // Intro animation settings
    intro: {
        headerFadeDelay: 250,
        headerFadeDuration: 900,
        subHeaderFadeDelay: 1000,
        subHeaderFadeDuration: 900,
        scrollIndicatorDelay: 2100
    },

    // Scroll indicator settings
    scrollIndicator: {
        text: "scroll",
        position: { bottom: "8%", left: "50%", transform: "translateX(-50%)" },
        color: "#000000",
        fontSize: "0.9rem",
        letterSpacing: "0.35rem",
        gap: "0.5rem",
        arrow: {
            width: "16px",
            height: "16px",
            borderWidth: "2px"
        }
    },

    // GLTF model settings
    model: {
        path: "models/scene.glb", // Path to GLTF/GLB file
        initialPosition: { x: 0, y: -30, z: 0 }, // Start below screen
        finalPosition: { x: 0, y: 5, z: 0 }, // Center position
        scale: { x: 1, y: 1, z: 1 },
        settleDuration: 1800,
        returnDuration: 1200,   // duration for model to lerp back to initialPosition
        rotationSpeed: 0.45,
        rotationResetDuration: 900
    },

    // Button container settings
    buttons: {
        container: {
            position: { bottom: "20%", left: "50%", transform: "translateX(-50%)" },
            translateStartY: 64,
            gap: "12px",
            revealDelayAfterModel: 120,
            revealDuration: 900
        },
        shared: {
            width: "260px",
            padding: "14px 24px"
        },
        explore: {
            text: "Explore"
        },
        login: {
            text: "Login to Add Memories"
        }
    },

    // Firebase frontend settings
    firebase: {
        enabled: true,
        config: {
            apiKey: "AIzaSyCI69RQA7cftkIvjBbB-k9-CCPfUHJ5DhU",
            authDomain: "powaiyear1.firebaseapp.com",
            projectId: "powaiyear1",
            storageBucket: "powaiyear1.firebasestorage.app",
            messagingSenderId: "505041993218",
            appId: "1:505041993218:web:cc7ddd98dd98963338311b",
            measurementId: "G-4S4ZVE84MT"
        }
    },

    // Auth UI and email access rules (uses Firebase email/password; enable it in the Firebase console)
    auth: {
        allowedStudentEmailPattern: /^[a-z0-9._%+-]+2024@bitsdesign\.edu\.in$/i,
        secretAllowedEmails: [
            "ad7944@nyu.edu",
            "de.aditya.2k@gmail.com"
        ],
        copy: {
            firstTimeHint: "logging in for the first time?",
            existingProfileHint: "Login to existing profile",
            emailLabel: "Email",
            passwordLabel: "Password",
            loginAction: "Login",
            registerAction: "Register email",
            helper: "only 2024@bitsdesign.edu.in emails are allowed",
            firebaseMissing: "Firebase is not configured yet. Add your project config in config.js.",
            emailInvalid: "Use a 2024@bitsdesign.edu.in email, or add the address to secretAllowedEmails.",
            passwordInvalid: "Enter a password of at least 6 characters.",
            registerSuccess: "Check your email to confirm your account, then log in with the password you chose.",
            loginFailed: "Couldn’t sign you in. Check your email and password and try again."
        }
    },

    // Memory system settings (press V when logged in to place a memory)
    memories: {
        orbHeight: 5,           // Y-center for orbs (and image plane) — adjust freely
        orbRadius: 0.1,        // radius of the red orb sphere
        orbColor: 0xff2222,     // orb colour
        proximityDistance: 1,   // world-unit distance that triggers plane reveal
        spawnDistance: 1,       // world units in front of player where memory spawns
        planeHeight: 0.9,       // height of the image plane (world units); width is derived from image aspect ratio
        planeFadeDuration: 0.5, // seconds for plane/orb opacity transition
        orbPulseSpeed: 1,     // glow pulse frequency in Hz
        orbPulseMin: 0.5,       // minimum emissiveIntensity
        orbPulseMax: 1.2,       // maximum emissiveIntensity
        firestoreCollection: 'memories',
        storagePath: 'memories'
    },

    // Instructions box settings
    instructions: {
        text: "WASD to move<br>Mouse to look<br>Spacebar to lock/unlock controls <br>Go close to an orb and <br> place the cursor on it <br> to view a memory",
        mobileText: "Left stick: move<br>Right stick: look<br><br>Go close to an orb and <br> place the cursor on it <br> to view a memory",
        position: { bottom: "10px", left: "10px" },
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        color: "#ffffff",
        padding: "10px",
        borderRadius: "5px",
        fontSize: "14px",
        showAfterExplore: true
    },

    // Reticle (crosshair ring shown when pointer-locked)
    reticle: {
        innerRadius: 0.006,
        outerRadius: 0.009,
        segments: 32,
        color: 0xffffff,
        zOffset: -0.4    // local Z in front of camera
    },

    // Controls settings
    controls: {
        moveSpeed: 3,
        lookSpeed: 0.002,
        mobileLookSensitivity: 1.8, // radians/second at full joystick deflection
        jumpSpeed: 0,
        gravity: 0
    },

    // Scroll settings
    scroll: {
        sections: 2,
        indicatorEndSection: 1,
        menuReturnStartSection: 0.82,
        triggerHeaderFadeProgress: 0.8,
        resetTopThreshold: 8,
        autoScrollDelay: 200,
        autoScrollDuration: 800
    }
};
