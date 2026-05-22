/* ==========================================================================
   HORIZONGET MOCK AUTHENTICATION CONTROLLER (LocalStorage-based)
   ========================================================================== */

// Check session and show the correct view (landing vs app)
function checkAuth() {
    const session = localStorage.getItem("horizon_session");
    const landingEl = document.getElementById("landing-page");
    const appEl    = document.getElementById("app");
    const modalEl  = document.getElementById("auth-modal");

    if (session) {
        if (landingEl) landingEl.classList.add("hidden");
        if (modalEl)   modalEl.classList.add("hidden");
        appEl.classList.remove("hidden");
        loadUserProfile();
        return true;
    } else {
        if (landingEl) landingEl.classList.remove("hidden");
        appEl.classList.add("hidden");
        return false;
    }
}

// Open the auth modal (optionally pre-select a tab and plan)
function openAuthModal(tab, plan) {
    const modal = document.getElementById("auth-modal");
    modal.classList.remove("hidden");
    switchAuthTab(tab || "login");

    const banner   = document.getElementById("auth-plan-banner");
    const planName = document.getElementById("auth-plan-name");
    const planMap  = { pro: "Pro — $4.99/month", business: "Business — $14.99/month", free: "Free Forever" };

    if (plan && planMap[plan]) {
        planName.textContent = planMap[plan];
        banner.classList.remove("hidden");
    } else if (banner) {
        banner.classList.add("hidden");
    }
    modal.dataset.selectedPlan = plan || "free";
    lucide.createIcons();
}

// Close the auth modal and return to the landing page
function closeAuthModal() {
    document.getElementById("auth-modal").classList.add("hidden");
}

// Dismiss modal on backdrop click
function handleAuthOverlayClick(e) {
    if (e.target === document.getElementById("auth-modal")) closeAuthModal();
}

// Switch between Sign In and Create Account tabs
function switchAuthTab(tab) {
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const formLogin = document.getElementById("login-form");
    const formRegister = document.getElementById("register-form");
    
    if (tab === 'login') {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        formLogin.classList.remove("hidden");
        formRegister.classList.add("hidden");
    } else {
        tabLogin.classList.remove("active");
        tabRegister.classList.add("active");
        formLogin.classList.add("hidden");
        formRegister.classList.remove("hidden");
    }
}

// Update registration fields based on country selection
function updateRegCountryDefaults() {
    // Left for potential country specific registrations on registration card
}

// Handle Sign In submission
function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    
    const users = JSON.parse(localStorage.getItem("horizon_users") || "[]");
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        localStorage.setItem("horizon_session", email);
        showToast("Welcome back, " + user.name + "!", "check-circle");
        checkAuth();
        if (typeof initDashboard === 'function') initDashboard();
        switchTab('dashboard');
    } else {
        showToast("Invalid email or password.", "x-circle");
    }
}

// Handle Sign Up submission
function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const companyName = document.getElementById("reg-company").value.trim();
    const email = document.getElementById("reg-email").value.trim().toLowerCase();
    const password = document.getElementById("reg-password").value;
    const country = document.getElementById("reg-country").value;
    
    if (password.length < 6) {
        showToast("Password must be at least 6 characters.", "alert-triangle");
        return;
    }
    
    const users = JSON.parse(localStorage.getItem("horizon_users") || "[]");
    const existing = users.find(u => u.email === email);
    
    if (existing) {
        showToast("Email address already registered.", "alert-triangle");
        return;
    }
    
    // Create new profile with smart defaults based on country choice
    const countryDefaults = getCountryMeta(country);
    
    const newUser = {
        name,
        companyName,
        email,
        password,
        country,
        phone: "",
        address: "123 Business Lane, Suite A\nCity, Region",
        taxId: "",
        logo: "",
        payment: {
            type: "bank",
            bankName: "",
            bankAccount: "",
            bankRouting: "",
            upiId: "",
            upiName: "",
            paypalId: "",
            customUrl: "",
            notes: "Thank you for your business! Payment is requested via direct transfer or scan payment QR."
        }
    };
    
    // Save selected plan from modal
    const modal = document.getElementById("auth-modal");
    newUser.plan = (modal && modal.dataset.selectedPlan) || "free";

    users.push(newUser);
    localStorage.setItem("horizon_users", JSON.stringify(users));
    localStorage.setItem("horizon_session", email);

    showToast("Account created! Welcome to Horizon.", "sparkles");
    checkAuth();
    if (typeof loadSettings === 'function') loadSettings();
    if (typeof initDashboard === 'function') initDashboard();
    switchTab('dashboard');
}

// Handle Log Out — return to landing page
function handleLogout() {
    localStorage.removeItem("horizon_session");
    showToast("Signed out successfully.", "log-out");
    document.getElementById("login-email").value = "";
    document.getElementById("login-password").value = "";
    checkAuth();
}

// Retrieve active user record
function getActiveUser() {
    const session = localStorage.getItem("horizon_session");
    if (!session) return null;
    
    const users = JSON.parse(localStorage.getItem("horizon_users") || "[]");
    return users.find(u => u.email === session) || null;
}

// Save active user profile update
function saveActiveUser(updatedUserRecord) {
    const session = localStorage.getItem("horizon_session");
    if (!session) return false;
    
    const users = JSON.parse(localStorage.getItem("horizon_users") || "[]");
    const index = users.findIndex(u => u.email === session);
    
    if (index !== -1) {
        users[index] = { ...users[index], ...updatedUserRecord };
        localStorage.setItem("horizon_users", JSON.stringify(users));
        loadUserProfile(); // Refresh DOM badges
        return true;
    }
    return false;
}

// Populate user details on sidebars and visual labels
function loadUserProfile() {
    const user = getActiveUser();
    if (!user) return;

    // Sidebar profile
    document.getElementById("user-display-name").innerText = user.name;
    document.getElementById("user-display-company").innerText = user.companyName;

    // Avatar initials
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById("user-avatar-initials").innerText = initials || "HG";

    // Show admin nav tab only for admin accounts
    const adminNav = document.getElementById("nav-admin");
    if (adminNav) adminNav.style.display = user.isAdmin ? "flex" : "none";
}

// Seed the Horizon admin account on first load
(function seedAdminUser() {
    const users = JSON.parse(localStorage.getItem("horizon_users") || "[]");
    const hasAdmin = users.some(u => u.email === "sales@horizon-sa.net");
    if (!hasAdmin) {
        users.unshift({
            name: "Horizon Admin",
            companyName: "Horizon",
            email: "sales@horizon-sa.net",
            password: "Basis@6695",
            country: "SA",
            phone: "",
            address: "",
            taxId: "",
            logo: "",
            isAdmin: true,
            payment: {
                type: "bank",
                bankName: "",
                bankAccount: "",
                bankRouting: "",
                upiId: "",
                upiName: "",
                paypalId: "",
                customUrl: "",
                notes: ""
            }
        });
        localStorage.setItem("horizon_users", JSON.stringify(users));
    }
})();

// Helper to register a mock guest user to make testing effortless
(function seedMockUser() {
    const users = JSON.parse(localStorage.getItem("horizon_users") || "[]");
    const hasSeed = users.some(u => u.email === "guest@horizon.com");
    if (!hasSeed) {
        users.push({
            name: "Guest Merchant",
            companyName: "Horizon Ventures",
            email: "guest@horizon.com",
            password: "guest",
            country: "US",
            phone: "+1 (555) 019-9000",
            address: "456 Skyline Boulevard\nSan Francisco, CA 94107",
            taxId: "EIN-88-2947192",
            logo: "",
            payment: {
                type: "bank",
                bankName: "Horizon Central Bank",
                bankAccount: "US99 8739 2839 1234",
                bankRouting: "HCBUSD33",
                upiId: "",
                upiName: "",
                paypalId: "",
                customUrl: "",
                notes: "Please transfer funds to the designated bank account on the right or scan the QR Code."
            }
        });
        localStorage.setItem("horizon_users", JSON.stringify(users));
    }
})();
