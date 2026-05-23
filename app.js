/* ==========================================================================
   HORIZONGET MAIN APPLICATION ORCHESTRATOR (API-backed)
   ========================================================================== */

/* — In-memory data caches — */
let _invoices = [];
let _clients  = [];

/* ─ Country Registry ─────────────────────────────────────────────────────── */
const COUNTRY_REGISTRY = {
    US: { name: "United States",        code: "US", symbol: "$",    taxLabel: "Sales Tax", taxCode: "EIN",    defaultTaxRate: 8.25  },
    UK: { name: "United Kingdom",       code: "UK", symbol: "£",   taxLabel: "VAT",       taxCode: "VAT ID", defaultTaxRate: 20.00 },
    IN: { name: "India",                code: "IN", symbol: "₹",   taxLabel: "GST",       taxCode: "GSTIN",  defaultTaxRate: 18.00 },
    AU: { name: "Australia",            code: "AU", symbol: "$",   taxLabel: "GST",       taxCode: "ABN",    defaultTaxRate: 10.00 },
    AE: { name: "United Arab Emirates", code: "AE", symbol: "د.إ", taxLabel: "VAT",       taxCode: "TRN",    defaultTaxRate: 5.00  },
    SA: { name: "Saudi Arabia",         code: "SA", symbol: "ر.س", taxLabel: "VAT",       taxCode: "VAT No", defaultTaxRate: 15.00 },
    EU: { name: "European Union",       code: "EU", symbol: "€",   taxLabel: "VAT",       taxCode: "VAT ID", defaultTaxRate: 19.00 }
};

function getCountryMeta(code) {
    const base      = COUNTRY_REGISTRY[code] || COUNTRY_REGISTRY.US;
    const overrides = getPricingCache();
    if (overrides[code] !== undefined) return { ...base, defaultTaxRate: overrides[code] };
    return base;
}

/* ─ Data refresh helpers ─────────────────────────────────────────────────── */
async function refreshInvoices() {
    try {
        const rows = await apiCall('/api/invoices');
        _invoices = (rows || []).map(normalizeInvoice);
    } catch { _invoices = []; }
}

async function refreshClients() {
    try {
        const rows = await apiCall('/api/clients');
        _clients = (rows || []).map(normalizeClient);
    } catch { _clients = []; }
}

/* ─ App init (called after login / on page load with valid token) ─────────── */
async function initAppData() {
    await Promise.all([refreshInvoices(), refreshClients()]);
    loadSettings();
    initDashboard();
    initHistoryTable();
    loadClientDirectory();
    initInvoiceBuilder();
}

/* ─ Bootstrap ────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
    lucide.createIcons();

    const savedTheme = localStorage.getItem("horizon_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeUI(savedTheme);

    const isLoggedIn = checkAuth();
    if (isLoggedIn) {
        await loadPricingCache();
        await initAppData();
    }
});

/* ─ Billing period toggle on landing page ────────────────────────────────── */
let billingAnnual = false;
function toggleBilling() {
    billingAnnual = !billingAnnual;
    const btn  = document.getElementById("billing-toggle-btn");
    const lblM = document.getElementById("lbl-monthly");
    const lblA = document.getElementById("lbl-annual");

    if (billingAnnual) {
        btn.classList.add("toggled"); lblM.classList.remove("active"); lblA.classList.add("active");
        document.getElementById("pro-price").textContent   = "3.74";
        document.getElementById("pro-period").textContent  = "/month";
        document.getElementById("pro-tagline").textContent = "Billed $44.88/year · save $15";
        document.getElementById("biz-price").textContent   = "10.74";
        document.getElementById("biz-period").textContent  = "/month";
        document.getElementById("biz-tagline").textContent = "Billed $128.88/year · save $51";
    } else {
        btn.classList.remove("toggled"); lblM.classList.add("active"); lblA.classList.remove("active");
        document.getElementById("pro-price").textContent   = "4.99";
        document.getElementById("pro-period").textContent  = "/month";
        document.getElementById("pro-tagline").textContent = "Billed monthly · cancel anytime";
        document.getElementById("biz-price").textContent   = "14.99";
        document.getElementById("biz-period").textContent  = "/month";
        document.getElementById("biz-tagline").textContent = "Billed monthly · cancel anytime";
    }
}

/* ─ Tab Switching Router ─────────────────────────────────────────────────── */
function switchTab(tabId) {
    if (!localStorage.getItem("horizon_token")) return;

    document.querySelectorAll(".content-section").forEach(s => s.classList.add("hidden"));
    const activeSection = document.getElementById(`section-${tabId}`);
    if (activeSection) activeSection.classList.remove("hidden");

    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    const activeNav = document.getElementById(`nav-${tabId}`);
    if (activeNav) activeNav.classList.add("active");

    if      (tabId === 'dashboard') { refreshInvoices().then(() => initDashboard()); }
    else if (tabId === 'history')   { refreshInvoices().then(() => initHistoryTable()); }
    else if (tabId === 'clients')   { refreshClients().then(() => loadClientDirectory()); }
    else if (tabId === 'settings')  { fetchAndCacheUser().then(() => loadSettings()); }
    else if (tabId === 'admin')     { initAdminPanel(); }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─ Theme Management ─────────────────────────────────────────────────────── */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const nextTheme    = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("horizon_theme", nextTheme);
    updateThemeUI(nextTheme);
    showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} Mode`, "sun");
}

function updateThemeUI(theme) {
    const textEl = document.getElementById("theme-text");
    if (textEl) textEl.innerText = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

/* ─ Dashboard Finance Aggregator ─────────────────────────────────────────── */
function initDashboard() {
    const user = getActiveUser();
    if (!user) return;

    const profileMeta = getCountryMeta(user.country || "US");
    const sym         = profileMeta.symbol;

    let totalInvoiced = 0, totalPaid = 0, totalDue = 0, paidCount = 0, dueCount = 0;
    _invoices.forEach(inv => {
        const amt = parseFloat(inv.grandTotal);
        totalInvoiced += amt;
        if (inv.status === "Paid") { totalPaid += amt; paidCount++; }
        else                       { totalDue  += amt; dueCount++; }
    });

    const fmt = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById("dash-total-invoiced").innerText = `${sym}${fmt(totalInvoiced)}`;
    document.getElementById("dash-total-paid").innerText     = `${sym}${fmt(totalPaid)}`;
    document.getElementById("dash-total-due").innerText      = `${sym}${fmt(totalDue)}`;
    document.getElementById("dash-invoice-count").innerText  = `${_invoices.length} Invoices total`;
    document.getElementById("dash-paid-count").innerText     = `${paidCount} Marked Paid`;
    document.getElementById("dash-due-count").innerText      = `${dueCount} Outstanding`;

    const tbody  = document.getElementById("dash-recent-invoices-body");
    tbody.innerHTML = "";
    const sorted = [..._invoices].sort((a,b) => b.timestamp - a.timestamp).slice(0, 5);

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No invoices created yet.</td></tr>`;
    } else {
        sorted.forEach(inv => {
            const tr = document.createElement("tr");
            const s  = getCountryMeta(inv.country).symbol;
            const statusClass = inv.status === 'Paid' ? 'paid' : 'outstanding';
            tr.innerHTML = `
                <td><strong>${inv.invoiceNumber}</strong></td>
                <td>${inv.clientName}</td>
                <td>${formatDateString(inv.issueDate)}</td>
                <td>${s}${parseFloat(inv.grandTotal).toFixed(2)}</td>
                <td><span class="status-badge ${statusClass}">${inv.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    const upgradeBanner = document.getElementById("upgrade-banner");
    if (upgradeBanner) {
        if (!user.plan || user.plan === 'free') {
            upgradeBanner.classList.remove("hidden");
        } else {
            upgradeBanner.classList.add("hidden");
        }
    }

    const compPreview = document.getElementById("dash-company-preview");
    if (compPreview) {
        compPreview.innerHTML = `
            <h4 style="font-weight:700;margin-bottom:6px;">${user.companyName}</h4>
            <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.4">${user.address || 'No physical address set'}</p>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;"><strong>Country:</strong> ${profileMeta.name}</p>
            <p style="font-size:0.8rem;color:var(--text-secondary);"><strong>Tax Identifier:</strong> ${user.taxId || 'Not configured'}</p>
        `;
    }
}

/* ─ Invoice History Table ────────────────────────────────────────────────── */
function initHistoryTable() {
    const tbody = document.getElementById("history-table-body");
    tbody.innerHTML = "";

    if (_invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">No invoices found. Write your first one today!</td></tr>`;
        return;
    }

    const sorted = [..._invoices].sort((a,b) => b.timestamp - a.timestamp);
    sorted.forEach(inv => {
        const tr  = document.createElement("tr");
        const sym = getCountryMeta(inv.country).symbol;
        const statusClass = inv.status === 'Paid' ? 'paid' : 'outstanding';
        tr.innerHTML = `
            <td><strong>${inv.invoiceNumber}</strong></td>
            <td>${inv.clientName}</td>
            <td><span class="badge-tag">${inv.country}</span></td>
            <td>${formatDateString(inv.issueDate)}</td>
            <td>${sym}${parseFloat(inv.grandTotal).toFixed(2)}</td>
            <td>
                <span class="status-badge ${statusClass}" onclick="toggleInvoicePaidStatus('${inv.id}')" title="Click to toggle" style="cursor:pointer">
                    ${inv.status}
                </span>
            </td>
            <td class="text-right">
                <div class="flex gap-2" style="justify-content:flex-end">
                    <button class="btn btn-sm btn-outline" onclick="editInvoice('${inv.id}')" title="Edit"><i data-lucide="edit-3"></i></button>
                    <button class="btn btn-sm btn-outline" onclick="openShareModalDirect('${inv.id}')" title="Share"><i data-lucide="share-2"></i></button>
                    <button class="btn btn-sm btn-outline" onclick="printInvoiceDirect('${inv.id}')" title="Print"><i data-lucide="printer"></i></button>
                    <button class="btn btn-sm btn-text-danger" onclick="deleteInvoice('${inv.id}')" title="Delete"><i data-lucide="trash-2"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function openShareModalDirect(id) {
    const inv = _invoices.find(i => i.id === id);
    if (inv) openShareModal(inv);
}

function printInvoiceDirect(id) {
    const inv = _invoices.find(i => i.id === id);
    if (!inv) return;
    editInvoice(id);
    setTimeout(() => window.print(), 300);
}

/* ─ Client Directory ─────────────────────────────────────────────────────── */
function loadClientDirectory() {
    const listContainer = document.getElementById("clients-list-container");
    listContainer.innerHTML = "";

    const select = document.getElementById("inv-client-selector");
    select.innerHTML = '<option value="">-- Quick Load Saved Client --</option>';

    if (_clients.length === 0) {
        listContainer.innerHTML = `<p class="text-center text-muted py-4">No clients saved. Clients are added automatically when you save invoices, or you can create one manually.</p>`;
        return;
    }

    _clients.forEach(c => {
        const card = document.createElement("div");
        card.className = "client-item-card";
        card.innerHTML = `
            <div class="client-item-info"><h4>${c.name}</h4><p>${c.email} | ${c.phone || 'No phone'}</p></div>
            <div class="flex gap-2">
                <button class="btn btn-sm btn-outline" onclick="loadClientToForm('${c.id}')"><i data-lucide="edit-2"></i></button>
                <button class="btn btn-sm btn-text-danger" onclick="deleteClient('${c.id}')"><i data-lucide="trash"></i></button>
            </div>
        `;
        listContainer.appendChild(card);

        const opt = document.createElement("option");
        opt.value = c.id; opt.innerText = c.name;
        select.appendChild(opt);
    });
    lucide.createIcons();
}

function openAddClientModal() {
    document.getElementById("client-panel-title").innerText = "Add Client";
    document.getElementById("edit-client-id").value = "";
    document.getElementById("client-editor-form").reset();
}

async function handleSaveClient(event) {
    event.preventDefault();
    const name    = document.getElementById("client-name").value.trim();
    const email   = document.getElementById("client-email").value.trim();
    const phone   = document.getElementById("client-phone").value.trim();
    const address = document.getElementById("client-address").value.trim();
    const taxReg  = document.getElementById("client-tax-reg").value.trim();
    const editId  = document.getElementById("edit-client-id").value;

    const id = editId || 'cli_' + Date.now();
    try {
        await apiCall('/api/clients', { method: 'POST', body: { id, name, email, phone, address, taxReg } });
        showToast(editId ? "Client updated." : "Client added.", "check");
        await refreshClients();
        document.getElementById("client-editor-form").reset();
        document.getElementById("edit-client-id").value = "";
        document.getElementById("client-panel-title").innerText = "Add Client";
        loadClientDirectory();
    } catch (err) {
        showToast(err.message || "Error saving client.", "x-circle");
    }
}

function loadClientToForm(id) {
    const c = _clients.find(item => item.id === id);
    if (!c) return;
    document.getElementById("client-panel-title").innerText = "Edit Client";
    document.getElementById("edit-client-id").value    = c.id;
    document.getElementById("client-name").value       = c.name;
    document.getElementById("client-email").value      = c.email;
    document.getElementById("client-phone").value      = c.phone   || "";
    document.getElementById("client-address").value    = c.address || "";
    document.getElementById("client-tax-reg").value    = c.taxReg  || "";
}

async function deleteClient(id) {
    showConfirm('Remove Client', 'Remove this client from the directory? This cannot be undone.', async () => {
        try {
            await apiCall(`/api/clients/${id}`, { method: 'DELETE' });
            showToast("Client deleted.", "trash");
            await refreshClients();
            loadClientDirectory();
        } catch (err) {
            showToast(err.message || "Error deleting client.", "x-circle");
        }
    });
}

function autofillClientDetails() {
    const selectedId = document.getElementById("inv-client-selector").value;
    if (!selectedId) return;
    const c = _clients.find(item => item.id === selectedId);
    if (!c) return;
    document.getElementById("inv-client-name").value    = c.name;
    document.getElementById("inv-client-email").value   = c.email;
    document.getElementById("inv-client-phone").value   = c.phone   || "";
    document.getElementById("inv-client-address").value = c.address || "";
    document.getElementById("inv-client-tax-reg").value = c.taxReg  || "";
    updatePreview();
}

/* ─ Business Settings ────────────────────────────────────────────────────── */
function loadSettings() {
    const user = getActiveUser();
    if (!user) return;

    document.getElementById("set-company-name").value    = user.companyName || "";
    document.getElementById("set-company-email").value   = user.email       || "";
    document.getElementById("set-company-phone").value   = user.phone       || "";
    document.getElementById("set-company-address").value = user.address     || "";
    document.getElementById("set-default-country").value = user.country     || "US";
    document.getElementById("set-company-tax-id").value  = user.taxId       || "";

    const logoPrev = document.getElementById("settings-logo-preview");
    if (user.logo) {
        logoPrev.innerHTML = `<img src="${user.logo}" alt="Company Logo">`;
    } else {
        const initials = (user.companyName || "HG").split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        logoPrev.innerHTML = `<span>${initials}</span>`;
    }

    const pay = user.payment || {};
    document.getElementById("set-default-payment-type").value = pay.type        || "bank";
    document.getElementById("set-bank-name").value            = pay.bankName    || "";
    document.getElementById("set-bank-acc").value             = pay.bankAccount || "";
    document.getElementById("set-bank-routing").value         = pay.bankRouting || "";
    document.getElementById("set-upi-id").value               = pay.upiId       || "";
    document.getElementById("set-upi-name").value             = pay.upiName     || "";
    document.getElementById("set-paypal-id").value            = pay.paypalId    || "";
    document.getElementById("set-custom-url").value           = pay.customUrl   || "";
    document.getElementById("set-default-notes").value        = pay.notes       || "";

    handleSettingsCountryChange();
    toggleSettingsQRFields();
}

function handleSettingsCountryChange() {
    const country = document.getElementById("set-default-country").value;
    const meta    = getCountryMeta(country);
    document.getElementById("set-tax-reg-label").innerText = `Company ${meta.taxCode} Registration #`;
}

function toggleSettingsQRFields() {
    const type = document.getElementById("set-default-payment-type").value;
    ["set-qr-bank","set-qr-upi","set-qr-paypal","set-qr-custom"].forEach(id => {
        document.getElementById(id).classList.add("hidden");
    });
    if      (type === "bank")   document.getElementById("set-qr-bank").classList.remove("hidden");
    else if (type === "upi")    document.getElementById("set-qr-upi").classList.remove("hidden");
    else if (type === "paypal") document.getElementById("set-qr-paypal").classList.remove("hidden");
    else if (type === "custom") document.getElementById("set-qr-custom").classList.remove("hidden");
}

async function handleSaveSettings(event) {
    event.preventDefault();
    const success = await saveActiveUser({
        companyName: document.getElementById("set-company-name").value.trim(),
        phone:       document.getElementById("set-company-phone").value.trim(),
        address:     document.getElementById("set-company-address").value.trim(),
        country:     document.getElementById("set-default-country").value,
        taxId:       document.getElementById("set-company-tax-id").value.trim()
    });
    if (success) { showToast("Company profile updated successfully.", "check-circle"); initDashboard(); }
}

async function savePaymentDefaults() {
    const success = await saveActiveUser({
        payment: {
            type:        document.getElementById("set-default-payment-type").value,
            bankName:    document.getElementById("set-bank-name").value.trim(),
            bankAccount: document.getElementById("set-bank-acc").value.trim(),
            bankRouting: document.getElementById("set-bank-routing").value.trim(),
            upiId:       document.getElementById("set-upi-id").value.trim(),
            upiName:     document.getElementById("set-upi-name").value.trim(),
            paypalId:    document.getElementById("set-paypal-id").value.trim(),
            customUrl:   document.getElementById("set-custom-url").value.trim(),
            notes:       document.getElementById("set-default-notes").value
        }
    });
    if (success) showToast("Payment defaults updated.", "check-circle");
}

async function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { showToast("Image exceeds 500KB limit.", "alert-triangle"); return; }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const success = await saveActiveUser({ logo: e.target.result });
        if (success) { showToast("Company logo updated.", "check"); loadSettings(); updatePreview(); }
    };
    reader.readAsDataURL(file);
}

async function clearLogoUpload() {
    const success = await saveActiveUser({ logo: "" });
    if (success) { showToast("Logo removed.", "check"); loadSettings(); updatePreview(); }
}

/* ─ Confirm Dialog ───────────────────────────────────────────────────────── */
let _confirmCallback = null;

function showConfirm(title, message, onConfirm, { okLabel = 'Confirm', danger = true } = {}) {
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.textContent = okLabel;
    okBtn.className   = danger ? 'btn btn-danger' : 'btn btn-primary';
    const icon = document.getElementById('confirm-modal').querySelector('.confirm-modal-icon');
    if (danger) { icon.classList.remove('icon-info'); } else { icon.classList.add('icon-info'); }
    _confirmCallback = onConfirm;
    document.getElementById('confirm-modal').classList.remove('hidden');
    lucide.createIcons();
}

function confirmOk() {
    closeConfirmModal();
    if (_confirmCallback) _confirmCallback();
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    _confirmCallback = null;
}

function handleConfirmOverlayClick(e) {
    if (e.target === document.getElementById('confirm-modal')) closeConfirmModal();
}

/* ─ Toast Notifications ──────────────────────────────────────────────────── */
let toastTimeout = null;
function showToast(message, iconName = "info") {
    const toast    = document.getElementById("toast");
    const msgSpan  = document.getElementById("toast-message");
    const iconSpan = document.getElementById("toast-icon");
    if (!toast) return;
    clearTimeout(toastTimeout);
    msgSpan.innerText = message;
    iconSpan.setAttribute("data-lucide", iconName);
    lucide.createIcons();
    toast.classList.remove("hidden");
    toastTimeout = setTimeout(() => toast.classList.add("hidden"), 3500);
}

/* ─ Admin Panel ──────────────────────────────────────────────────────────── */
async function initAdminPanel() {
    const user = getActiveUser();
    if (!user || !user.isAdmin) { showToast("Access denied.", "shield-off"); switchTab('dashboard'); return; }
    await Promise.all([loadAdminAnalytics(), loadTenantsTable(), loadAdminPricingTable(), loadPlanPricingForm(), loadPaymentsTable(), loadPromosTable()]);
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('atab-' + tab).classList.add('active');
    document.getElementById('admin-tab-' + tab).classList.remove('hidden');
}

async function loadAdminAnalytics() {
    try {
        const d = await apiCall('/api/admin/analytics');
        document.getElementById('stat-total-users').textContent     = d.total_users;
        document.getElementById('stat-paid-users').textContent      = d.paid_users;
        document.getElementById('stat-total-invoices').textContent  = d.total_invoices;
        document.getElementById('stat-confirmed-revenue').textContent = '$' + parseFloat(d.confirmed_rev).toFixed(2);
        document.getElementById('stat-pending-payments').textContent = d.pending_count;
    } catch {}
}

async function loadTenantsTable() {
    const tbody = document.getElementById("admin-tenants-body");
    if (!tbody) return;
    try {
        const tenants = await apiCall('/api/admin/tenants');
        if (!tenants || tenants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No tenants registered yet.</td></tr>';
            return;
        }
        const planBadge = p => ({
            free:     '<span class="plan-badge plan-free">Free</span>',
            pro:      '<span class="plan-badge plan-pro">Pro</span>',
            business: '<span class="plan-badge plan-biz">Business</span>'
        })[p] || p;
        tbody.innerHTML = tenants.map(u => `<tr>
            <td><strong>${u.name}</strong></td>
            <td>${u.company_name || '—'}</td>
            <td>${u.email}</td>
            <td>${getCountryMeta(u.country).name}</td>
            <td>${planBadge(u.plan)}
                <select class="select-sm plan-changer" onchange="changeTenantPlan(${u.id}, this)" style="margin-left:6px;">
                    <option value="">Change…</option>
                    <option value="free">→ Free</option>
                    <option value="pro">→ Pro</option>
                    <option value="business">→ Business</option>
                </select>
            </td>
            <td>${u.invoice_count}</td>
            <td style="font-size:0.78rem;color:var(--text-secondary);">${new Date(u.created_at).toLocaleDateString()}</td>
            <td class="text-right">
                <button class="btn btn-sm btn-text-danger" onclick="deleteTenant(${u.id})">
                    <i data-lucide="user-x"></i>
                </button>
            </td>
        </tr>`).join('');
        lucide.createIcons();
    } catch {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Error loading tenants.</td></tr>`;
    }
}

async function changeTenantPlan(id, selectEl) {
    const plan = selectEl.value;
    if (!plan) return;
    showConfirm('Change Plan', `Upgrade/downgrade this user to the ${plan} plan?`, async () => {
        try {
            await apiCall(`/api/admin/tenants/${id}/plan`, { method: 'PUT', body: { plan } });
            showToast(`Plan changed to ${plan}.`, 'check-circle');
            await loadTenantsTable();
            loadAdminAnalytics();
        } catch (err) { showToast(err.message || 'Error changing plan.', 'x-circle'); }
    }, { okLabel: 'Change Plan', danger: false });
    selectEl.value = '';
}

async function deleteTenant(id) {
    showConfirm('Remove Tenant', 'Delete this tenant account permanently? All their invoices will be lost.', async () => {
        try {
            await apiCall(`/api/admin/tenants/${id}`, { method: 'DELETE' });
            showToast("Tenant removed.", "check-circle");
            await loadTenantsTable();
            loadAdminAnalytics();
        } catch (err) { showToast(err.message || "Error removing tenant.", "x-circle"); }
    });
}

async function loadAdminPricingTable() {
    const tbody = document.getElementById("admin-pricing-body");
    if (!tbody) return;
    let overrides = {};
    try { overrides = await apiCall('/api/admin/pricing') || {}; } catch {}
    tbody.innerHTML = Object.entries(COUNTRY_REGISTRY).map(([code, meta]) => {
        const rate = overrides[code] !== undefined ? overrides[code] : meta.defaultTaxRate;
        return `<tr>
            <td>${meta.name}</td><td>${meta.symbol}</td><td>${meta.taxLabel}</td>
            <td><input type="number" class="admin-rate-input" data-country="${code}" value="${rate}" min="0" max="100" step="0.01"></td>
        </tr>`;
    }).join('');
}

async function saveAdminPricing() {
    const inputs = document.querySelectorAll(".admin-rate-input");
    const overrides = {};
    inputs.forEach(i => { overrides[i.dataset.country] = parseFloat(i.value) || 0; });
    try {
        await apiCall('/api/admin/pricing', { method: 'PUT', body: overrides });
        await loadPricingCache();
        showToast("Tax rates saved.", "check-circle");
    } catch (err) { showToast(err.message || "Error saving.", "x-circle"); }
}

/* ── Plan Pricing ── */
async function loadPlanPricingForm() {
    try {
        const prices = await apiCall('/api/admin/plan-pricing');
        if (prices.pro)      { document.getElementById('pro-monthly-price').value = prices.pro.monthly; document.getElementById('pro-annual-price').value = prices.pro.annual; }
        if (prices.business) { document.getElementById('biz-monthly-price').value = prices.business.monthly; document.getElementById('biz-annual-price').value = prices.business.annual; }
    } catch {}
}

async function savePlanPricing() {
    const body = {
        pro:      { monthly: parseFloat(document.getElementById('pro-monthly-price').value), annual: parseFloat(document.getElementById('pro-annual-price').value) },
        business: { monthly: parseFloat(document.getElementById('biz-monthly-price').value), annual: parseFloat(document.getElementById('biz-annual-price').value) }
    };
    try {
        await apiCall('/api/admin/plan-pricing', { method: 'PUT', body });
        showToast('Plan pricing updated.', 'check-circle');
    } catch (err) { showToast(err.message || 'Error saving pricing.', 'x-circle'); }
}

/* ── Payments ── */
async function loadPaymentsTable() {
    const tbody = document.getElementById('admin-payments-body');
    if (!tbody) return;
    try {
        const payments = await apiCall('/api/admin/payments');
        if (!payments || payments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No payments logged yet.</td></tr>'; return;
        }
        const statusBadge = s => ({
            confirmed: '<span class="plan-badge plan-pro">Confirmed</span>',
            pending:   '<span class="plan-badge" style="background:rgba(201,129,32,0.15);color:#C98120;">Pending</span>',
            rejected:  '<span class="plan-badge plan-free">Rejected</span>'
        })[s] || s;
        tbody.innerHTML = payments.map(p => `<tr>
            <td><strong>${p.user_name}</strong><br><small style="color:var(--text-secondary)">${p.user_email}</small></td>
            <td><span style="text-transform:capitalize">${p.plan}</span></td>
            <td>$${parseFloat(p.amount).toFixed(2)}</td>
            <td>${statusBadge(p.status)}</td>
            <td style="font-size:0.78rem;color:var(--text-secondary)">${new Date(p.created_at).toLocaleDateString()}</td>
            <td class="text-right" style="display:flex;gap:4px;justify-content:flex-end;">
                ${p.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="confirmPayment(${p.id})" title="Confirm"><i data-lucide="check"></i></button>` : ''}
                <button class="btn btn-sm btn-text-danger" onclick="deletePayment(${p.id})" title="Delete"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('');
        lucide.createIcons();
    } catch { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Error loading payments.</td></tr>'; }
}

async function handleLogPayment(event) {
    event.preventDefault();
    const body = {
        email:      document.getElementById('pay-user-email').value.trim().toLowerCase(),
        plan:       document.getElementById('pay-plan').value,
        amount:     parseFloat(document.getElementById('pay-amount').value),
        paymentRef: document.getElementById('pay-ref').value.trim(),
        notes:      document.getElementById('pay-notes').value.trim(),
        status:     document.getElementById('pay-status').value
    };
    try {
        await apiCall('/api/admin/payments', { method: 'POST', body });
        showToast('Payment logged' + (body.status === 'confirmed' ? ' & plan activated.' : '.'), 'check-circle');
        document.getElementById('log-payment-form').reset();
        await loadPaymentsTable();
        loadAdminAnalytics();
        loadTenantsTable();
    } catch (err) { showToast(err.message || 'Error logging payment.', 'x-circle'); }
}

async function confirmPayment(id) {
    showConfirm('Confirm Payment', 'Mark this payment as confirmed and activate the user\'s plan?', async () => {
        try {
            await apiCall(`/api/admin/payments/${id}`, { method: 'PUT', body: { status: 'confirmed' } });
            showToast('Payment confirmed & plan activated.', 'check-circle');
            await loadPaymentsTable();
            loadAdminAnalytics();
            loadTenantsTable();
        } catch (err) { showToast(err.message || 'Error.', 'x-circle'); }
    }, { okLabel: 'Confirm', danger: false });
}

async function deletePayment(id) {
    showConfirm('Delete Record', 'Remove this payment record?', async () => {
        try {
            await apiCall(`/api/admin/payments/${id}`, { method: 'DELETE' });
            showToast('Payment record removed.', 'trash');
            await loadPaymentsTable();
            loadAdminAnalytics();
        } catch (err) { showToast(err.message || 'Error.', 'x-circle'); }
    });
}

/* ── Promo Codes ── */
async function loadPromosTable() {
    const tbody = document.getElementById('admin-promos-body');
    if (!tbody) return;
    try {
        const promos = await apiCall('/api/admin/promos');
        if (!promos || promos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No promo codes yet.</td></tr>'; return;
        }
        tbody.innerHTML = promos.map(p => `<tr>
            <td><strong>${p.code}</strong>${p.description ? `<br><small style="color:var(--text-secondary)">${p.description}</small>` : ''}</td>
            <td>${p.discount_type === 'percent' ? p.discount_value + '%' : '$' + parseFloat(p.discount_value).toFixed(2)} off${p.applicable_plan ? ' (' + p.applicable_plan + ')' : ''}</td>
            <td>${p.uses_count}${p.max_uses ? ' / ' + p.max_uses : ''}</td>
            <td style="font-size:0.78rem">${p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '—'}</td>
            <td><label class="toggle-switch-sm" title="${p.is_active ? 'Active' : 'Inactive'}">
                <input type="checkbox" ${p.is_active ? 'checked' : ''} onchange="togglePromo(${p.id}, this.checked)">
                <span class="toggle-slider-sm"></span>
            </label></td>
            <td class="text-right">
                <button class="btn btn-sm btn-text-danger" onclick="deletePromo(${p.id})"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('');
        lucide.createIcons();
    } catch { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Error loading promos.</td></tr>'; }
}

async function handleCreatePromo(event) {
    event.preventDefault();
    const code = document.getElementById('promo-code').value.trim().toUpperCase();
    const body = {
        code, description: document.getElementById('promo-desc').value.trim(),
        discountType:    document.getElementById('promo-type').value,
        discountValue:   parseFloat(document.getElementById('promo-value').value),
        applicablePlan:  document.getElementById('promo-plan').value || null,
        maxUses:         document.getElementById('promo-max-uses').value ? parseInt(document.getElementById('promo-max-uses').value) : null,
        expiresAt:       document.getElementById('promo-expires').value || null
    };
    try {
        await apiCall('/api/admin/promos', { method: 'POST', body });
        showToast('Promo code created.', 'gift');
        document.getElementById('create-promo-form').reset();
        await loadPromosTable();
    } catch (err) { showToast(err.message || 'Error creating promo.', 'x-circle'); }
}

async function togglePromo(id, isActive) {
    try {
        await apiCall(`/api/admin/promos/${id}`, { method: 'PUT', body: { isActive } });
        showToast(isActive ? 'Promo activated.' : 'Promo deactivated.', 'check-circle');
    } catch (err) { showToast(err.message || 'Error.', 'x-circle'); loadPromosTable(); }
}

async function deletePromo(id) {
    showConfirm('Delete Promo', 'Delete this promo code permanently?', async () => {
        try {
            await apiCall(`/api/admin/promos/${id}`, { method: 'DELETE' });
            showToast('Promo deleted.', 'trash');
            await loadPromosTable();
        } catch (err) { showToast(err.message || 'Error.', 'x-circle'); }
    });
}
