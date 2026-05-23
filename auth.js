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
    const formForgot   = document.getElementById('forgot-form');
    const formCheck    = document.getElementById('check-email-view');

    [formLogin, formRegister, formForgot, formCheck].forEach(el => el && el.classList.add('hidden'));
    [tabLogin, tabRegister].forEach(el => el && el.classList.remove('active'));

    if (tab === 'login') {
        tabLogin.classList.add('active');
        formLogin && formLogin.classList.remove('hidden');
    } else if (tab === 'register') {
        tabRegister.classList.add('active');
        formRegister && formRegister.classList.remove('hidden');
    } else if (tab === 'forgot') {
        formForgot && formForgot.classList.remove('hidden');
    } else if (tab === 'check-email') {
        formCheck && formCheck.classList.remove('hidden');
    }
}

function updateRegCountryDefaults() {}

function showUnverifiedBanner(email) {
    const banner = document.getElementById('unverified-banner');
    const emailEl = document.getElementById('unverified-email');
    if (banner) { if (emailEl) emailEl.value = email; banner.classList.remove('hidden'); }
}

async function handleResendVerification() {
    const emailEl = document.getElementById('unverified-email');
    const email   = emailEl ? emailEl.value.trim() : '';
    if (!email) return;
    try {
        const data = await apiCall('/api/auth/resend-verification', { method: 'POST', body: { email } });
        showToast(data.message || 'Verification email sent!', 'mail');
        document.getElementById('unverified-banner') && document.getElementById('unverified-banner').classList.add('hidden');
    } catch (err) {
        showToast(err.message || 'Could not resend email.', 'x-circle');
    }
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('forgot-email').value.trim().toLowerCase();
    if (!email) return;
    try {
        const data = await apiCall('/api/auth/forgot-password', { method: 'POST', body: { email } });
        showToast(data.message, 'mail');
        switchAuthTab('login');
    } catch (err) {
        showToast(err.message || 'Could not send reset email.', 'x-circle');
    }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const password  = document.getElementById('reset-password').value;
    const password2 = document.getElementById('reset-password2').value;
    const token     = document.getElementById('reset-token-input').value;

    if (password.length < 6) { showToast('Password must be at least 6 characters.', 'alert-triangle'); return; }
    if (password !== password2) { showToast('Passwords do not match.', 'alert-triangle'); return; }

    try {
        const data = await apiCall('/api/auth/reset-password', { method: 'POST', body: { token, password } });
        showToast(data.message, 'check-circle');
        document.getElementById('reset-modal').classList.add('hidden');
        openAuthModal('login');
        window.history.replaceState({}, '', '/');
    } catch (err) {
        showToast(err.message || 'Reset failed.', 'x-circle');
    }
}

/* ── Handle URL params on page load (email verified / reset token) ── */
(function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('verified') === '1') {
        window.history.replaceState({}, '', '/');
        setTimeout(() => {
            showToast('Email verified! You can now sign in.', 'check-circle');
            openAuthModal('login');
        }, 400);
    }

    if (params.get('verified') === 'error') {
        window.history.replaceState({}, '', '/');
        setTimeout(() => showToast('Verification link is invalid or expired.', 'x-circle'), 400);
    }

    const resetToken = params.get('reset_token');
    if (resetToken) {
        window.history.replaceState({}, '', '/');
        setTimeout(() => {
            const modal = document.getElementById('reset-modal');
            const input = document.getElementById('reset-token-input');
            if (modal && input) { input.value = resetToken; modal.classList.remove('hidden'); lucide.createIcons(); }
        }, 400);
    }
})();

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
        if (err.message === 'email_not_verified') {
            showUnverifiedBanner(email);
        } else {
            showToast(err.message || 'Invalid email or password.', 'x-circle');
        }
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
        showToast(data.message || 'Account created! Check your email to verify.', 'mail');
        switchAuthTab('check-email');
        if (plan === 'pro' || plan === 'business') {
            setTimeout(() => showPaymentModal(plan), 800);
        }
    } catch (err) {
        showToast(err.message || 'Registration failed.', 'x-circle');
    }
}

function handleLogout() {
    showConfirm('Sign Out', 'Are you sure you want to sign out of your account?', () => {
        clearSession();
        showToast('Signed out successfully.', 'log-out');
        document.getElementById('login-email').value    = '';
        document.getElementById('login-password').value = '';
        checkAuth();
    }, { okLabel: 'Sign Out', danger: false });
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
