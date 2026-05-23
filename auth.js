/* ==========================================================================
   HORIZONGET AUTHENTICATION CONTROLLER (API-backed)
   ========================================================================== */

function checkAuth() {
    const token  = localStorage.getItem('horizon_token');
    const landingEl = document.getElementById('landing-page');
    const appEl     = document.getElementById('app');
    const modalEl   = document.getElementById('auth-modal');

    if (token && getActiveUser()) {
        if (landingEl) landingEl.classList.add('hidden');
        if (modalEl)   modalEl.classList.add('hidden');
        appEl.classList.remove('hidden');
        loadUserProfile();
        return true;
    } else {
        clearSession();
        if (landingEl) landingEl.classList.remove('hidden');
        appEl.classList.add('hidden');
        return false;
    }
}

function openAuthModal(tab, plan) {
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('hidden');
    switchAuthTab(tab || 'login');

    const banner   = document.getElementById('auth-plan-banner');
    const planName = document.getElementById('auth-plan-name');
    const planMap  = { pro: 'Pro — $4.99/month', business: 'Business — $14.99/month', free: 'Free Forever' };

    if (plan && planMap[plan]) {
        planName.textContent = planMap[plan];
        banner.classList.remove('hidden');
    } else if (banner) {
        banner.classList.add('hidden');
    }
    modal.dataset.selectedPlan = plan || 'free';
    lucide.createIcons();
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function handleAuthOverlayClick(e) {
    if (e.target === document.getElementById('auth-modal')) closeAuthModal();
}

function switchAuthTab(tab) {
    const tabLogin     = document.getElementById('tab-login');
    const tabRegister  = document.getElementById('tab-register');
    const formLogin    = document.getElementById('login-form');
    const formRegister = document.getElementById('register-form');

    if (tab === 'login') {
        tabLogin.classList.add('active');    tabRegister.classList.remove('active');
        formLogin.classList.remove('hidden'); formRegister.classList.add('hidden');
    } else {
        tabLogin.classList.remove('active'); tabRegister.classList.add('active');
        formLogin.classList.add('hidden');   formRegister.classList.remove('hidden');
    }
}

function updateRegCountryDefaults() {}

async function handleLogin(event) {
    event.preventDefault();
    const email    = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    try {
        const data = await apiCall('/api/auth/login', { method: 'POST', body: { email, password } });
        if (!data) return;
        localStorage.setItem('horizon_token', data.token);
        await fetchAndCacheUser();
        showToast('Welcome back, ' + data.user.name + '!', 'check-circle');
        checkAuth();
        await loadPricingCache();
        await initAppData();
        switchTab('dashboard');
    } catch (err) {
        showToast(err.message || 'Invalid email or password.', 'x-circle');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const name        = document.getElementById('reg-name').value.trim();
    const companyName = document.getElementById('reg-company').value.trim();
    const email       = document.getElementById('reg-email').value.trim().toLowerCase();
    const password    = document.getElementById('reg-password').value;
    const country     = document.getElementById('reg-country').value;

    if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'alert-triangle');
        return;
    }

    const modal = document.getElementById('auth-modal');
    const plan  = (modal && modal.dataset.selectedPlan) || 'free';

    try {
        const data = await apiCall('/api/auth/register', {
            method: 'POST',
            body: { name, companyName, email, password, country, plan }
        });
        if (!data) return;
        localStorage.setItem('horizon_token', data.token);
        await fetchAndCacheUser();
        showToast('Account created! Welcome to Horizon.', 'sparkles');
        checkAuth();
        await loadPricingCache();
        await initAppData();
        switchTab('dashboard');
        if (plan === 'pro' || plan === 'business') {
            setTimeout(() => showPaymentModal(plan), 600);
        }
    } catch (err) {
        showToast(err.message || 'Registration failed.', 'x-circle');
    }
}

function handleLogout() {
    clearSession();
    showToast('Signed out successfully.', 'log-out');
    document.getElementById('login-email').value    = '';
    document.getElementById('login-password').value = '';
    checkAuth();
}

async function saveActiveUser(updates) {
    try {
        if (updates.payment) {
            const pay = updates.payment;
            await apiCall('/api/settings', {
                method: 'PUT',
                body: {
                    paymentType: pay.type,    bankName:    pay.bankName,
                    bankAccount: pay.bankAccount, bankRouting: pay.bankRouting,
                    upiId:       pay.upiId,   upiName:  pay.upiName,
                    paypalId:    pay.paypalId, customUrl: pay.customUrl, notes: pay.notes
                }
            });
        } else {
            await apiCall('/api/auth/me', { method: 'PUT', body: updates });
        }
        await fetchAndCacheUser();
        loadUserProfile();
        return true;
    } catch (err) {
        showToast(err.message || 'Error saving profile.', 'x-circle');
        return false;
    }
}

function showPaymentModal(plan) {
    const modal     = document.getElementById('payment-modal');
    const planLabel = document.getElementById('payment-plan-label');
    const amtLabel  = document.getElementById('payment-amount-label');
    if (!modal) return;
    planLabel.textContent = plan === 'business' ? 'Business' : 'Pro';
    amtLabel.textContent  = plan === 'business' ? '$14.99 / month' : '$4.99 / month';
    modal.classList.remove('hidden');
    lucide.createIcons();
}

function closePaymentModal(event) {
    if (event && event.target !== document.getElementById('payment-modal')) return;
    const modal = document.getElementById('payment-modal');
    if (modal) modal.classList.add('hidden');
}

function loadUserProfile() {
    const user = getActiveUser();
    if (!user) return;

    document.getElementById('user-display-name').innerText    = user.name        || '';
    document.getElementById('user-display-company').innerText = user.companyName || '';

    const initials = (user.name || 'HG').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('user-avatar-initials').innerText = initials || 'HG';

    const adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.style.display = user.isAdmin ? 'flex' : 'none';
}
