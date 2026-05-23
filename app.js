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
    if (!confirm("Remove this client from the directory?")) return;
    try {
        await apiCall(`/api/clients/${id}`, { method: 'DELETE' });
        showToast("Client deleted.", "trash");
        await refreshClients();
        loadClientDirectory();
    } catch (err) {
        showToast(err.message || "Error deleting client.", "x-circle");
    }
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
    if (!user || !user.isAdmin) {
        showToast("Access denied.", "shield-off");
        switchTab('dashboard');
        return;
    }
    await Promise.all([loadTenantsTable(), loadAdminPricingTable()]);
}

async function loadTenantsTable() {
    const tbody = document.getElementById("admin-tenants-body");
    if (!tbody) return;
    try {
        const tenants = await apiCall('/api/admin/tenants');
        if (!tenants || tenants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No tenants registered yet.</td></tr>';
            return;
        }
        tbody.innerHTML = tenants.map(u => `<tr>
            <td><strong>${u.name}</strong></td>
            <td>${u.company_name || '—'}</td>
            <td>${u.email}</td>
            <td>${getCountryMeta(u.country).name}</td>
            <td>${u.invoice_count}</td>
            <td class="text-right">
                <button class="btn btn-sm btn-text-danger" onclick="deleteTenant(${u.id})">
                    <i data-lucide="user-x"></i><span>Remove</span>
                </button>
            </td>
        </tr>`).join('');
        lucide.createIcons();
    } catch {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Error loading tenants.</td></tr>`;
    }
}

async function deleteTenant(id) {
    if (!confirm("Remove tenant account? This cannot be undone.")) return;
    try {
        await apiCall(`/api/admin/tenants/${id}`, { method: 'DELETE' });
        showToast("Tenant removed.", "check-circle");
        await loadTenantsTable();
    } catch (err) {
        showToast(err.message || "Error removing tenant.", "x-circle");
    }
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
    const inputs    = document.querySelectorAll(".admin-rate-input");
    const overrides = {};
    inputs.forEach(input => { overrides[input.dataset.country] = parseFloat(input.value) || 0; });
    try {
        await apiCall('/api/admin/pricing', { method: 'PUT', body: overrides });
        await loadPricingCache();
        showToast("Pricing configuration saved.", "check-circle");
    } catch (err) {
        showToast(err.message || "Error saving pricing.", "x-circle");
    }
}
