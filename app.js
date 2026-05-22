/* ==========================================================================
   HORIZONGET MAIN APPLICATION ORCHESTRATOR
   ========================================================================== */

// Country Configurations Map
const COUNTRY_REGISTRY = {
    US: { name: "United States", code: "US", symbol: "$", taxLabel: "Sales Tax", taxCode: "EIN", defaultTaxRate: 8.25 },
    UK: { name: "United Kingdom", code: "UK", symbol: "£", taxLabel: "VAT", taxCode: "VAT ID", defaultTaxRate: 20.00 },
    IN: { name: "India", code: "IN", symbol: "₹", taxLabel: "GST", taxCode: "GSTIN", defaultTaxRate: 18.00 },
    AU: { name: "Australia", code: "AU", symbol: "$", taxLabel: "GST", taxCode: "ABN", defaultTaxRate: 10.00 },
    AE: { name: "United Arab Emirates", code: "AE", symbol: "د.إ", taxLabel: "VAT", taxCode: "TRN", defaultTaxRate: 5.00 },
    SA: { name: "Saudi Arabia", code: "SA", symbol: "ر.س", taxLabel: "VAT", taxCode: "VAT No", defaultTaxRate: 15.00 },
    EU: { name: "European Union", code: "EU", symbol: "€", taxLabel: "VAT", taxCode: "VAT ID", defaultTaxRate: 19.00 }
};

// Global helper to retrieve country details (respects admin pricing overrides)
function getCountryMeta(code) {
    const base = COUNTRY_REGISTRY[code] || COUNTRY_REGISTRY.US;
    const overrides = JSON.parse(localStorage.getItem("horizon_admin_pricing") || "{}");
    if (overrides[code] !== undefined) {
        return { ...base, defaultTaxRate: overrides[code] };
    }
    return base;
}

// App bootstrapping on window load
document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialise Lucide Icons
    lucide.createIcons();

    // 2. Restore last configured UI Theme
    const savedTheme = localStorage.getItem("horizon_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeUI(savedTheme);

    // 3. Validate current session — shows landing or app accordingly
    const isLoggedIn = checkAuth();

    if (isLoggedIn) {
        initDashboard();
        initInvoiceBuilder();
        initHistoryTable();
        loadClientDirectory();
        loadSettings();
    }
});

/* --- Billing period toggle on landing page --- */
let billingAnnual = false;
function toggleBilling() {
    billingAnnual = !billingAnnual;
    const btn = document.getElementById("billing-toggle-btn");
    const lblM = document.getElementById("lbl-monthly");
    const lblA = document.getElementById("lbl-annual");

    if (billingAnnual) {
        btn.classList.add("toggled");
        lblM.classList.remove("active");
        lblA.classList.add("active");
        document.getElementById("pro-price").textContent  = "3.74";
        document.getElementById("pro-period").textContent = "/month";
        document.getElementById("pro-tagline").textContent = "Billed $44.88/year · save $15";
        document.getElementById("biz-price").textContent  = "10.74";
        document.getElementById("biz-period").textContent = "/month";
        document.getElementById("biz-tagline").textContent = "Billed $128.88/year · save $51";
    } else {
        btn.classList.remove("toggled");
        lblM.classList.add("active");
        lblA.classList.remove("active");
        document.getElementById("pro-price").textContent  = "4.99";
        document.getElementById("pro-period").textContent = "/month";
        document.getElementById("pro-tagline").textContent = "Billed monthly · cancel anytime";
        document.getElementById("biz-price").textContent  = "14.99";
        document.getElementById("biz-period").textContent = "/month";
        document.getElementById("biz-tagline").textContent = "Billed monthly · cancel anytime";
    }
}

/* --- Tab Switching Router --- */
function switchTab(tabId) {
    // Prevent access if not logged in
    if (!localStorage.getItem("horizon_session")) return;

    // Toggle active classes on sections
    const sections = document.querySelectorAll(".content-section");
    sections.forEach(sec => sec.classList.add("hidden"));
    
    const activeSection = document.getElementById(`section-${tabId}`);
    if (activeSection) activeSection.classList.remove("hidden");
    
    // Toggle sidebar item highlighting
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => item.classList.remove("active"));
    
    const activeNav = document.getElementById(`nav-${tabId}`);
    if (activeNav) activeNav.classList.add("active");

    // Section specific load logic
    if (tabId === 'dashboard') {
        initDashboard();
    } else if (tabId === 'history') {
        initHistoryTable();
    } else if (tabId === 'clients') {
        loadClientDirectory();
    } else if (tabId === 'settings') {
        loadSettings();
    } else if (tabId === 'admin') {
        initAdminPanel();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --- Theme Management --- */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("horizon_theme", nextTheme);
    updateThemeUI(nextTheme);
    
    showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} Mode`, "sun");
}

function updateThemeUI(theme) {
    const textEl = document.getElementById("theme-text");
    if (textEl) {
        textEl.innerText = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
}

/* --- Dashboard Finance Aggregator --- */
function initDashboard() {
    const user = getActiveUser();
    if (!user) return;
    
    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    const userInvoices = invoices.filter(i => i.userEmail === user.email);
    
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalDue = 0;
    
    let paidCount = 0;
    let dueCount = 0;
    
    // Resolve currencies (group by country currency, standard dashboard converts to profile country currency symbol)
    const profileMeta = getCountryMeta(user.country || "US");
    const profileSymbol = profileMeta.symbol;
    
    userInvoices.forEach(inv => {
        const amt = parseFloat(inv.grandTotal);
        totalInvoiced += amt;
        
        if (inv.status === "Paid") {
            totalPaid += amt;
            paidCount++;
        } else {
            totalDue += amt;
            dueCount++;
        }
    });
    
    // Populate stats
    document.getElementById("dash-total-invoiced").innerText = `${profileSymbol}${totalInvoiced.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById("dash-total-paid").innerText = `${profileSymbol}${totalPaid.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById("dash-total-due").innerText = `${profileSymbol}${totalDue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    
    document.getElementById("dash-invoice-count").innerText = `${userInvoices.length} Invoices total`;
    document.getElementById("dash-paid-count").innerText = `${paidCount} Marked Paid`;
    document.getElementById("dash-due-count").innerText = `${dueCount} Outstanding`;
    
    // Recent invoices list
    const tbody = document.getElementById("dash-recent-invoices-body");
    tbody.innerHTML = "";
    
    const sorted = [...userInvoices].sort((a,b) => b.timestamp - a.timestamp).slice(0, 5);
    
    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No invoices created yet.</td></tr>`;
    } else {
        sorted.forEach(inv => {
            const tr = document.createElement("tr");
            const sym = getCountryMeta(inv.country).symbol;
            const amtStr = `${sym}${parseFloat(inv.grandTotal).toFixed(2)}`;
            const statusClass = inv.status === 'Paid' ? 'paid' : 'outstanding';
            
            tr.innerHTML = `
                <td><strong>${inv.invoiceNumber}</strong></td>
                <td>${inv.clientName}</td>
                <td>${formatDateString(inv.issueDate)}</td>
                <td>${amtStr}</td>
                <td><span class="status-badge ${statusClass}">${inv.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    // Update company details preview card on dashboard
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

/* --- Invoices History & Shares Table --- */
function initHistoryTable() {
    const user = getActiveUser();
    if (!user) return;
    
    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    const userInvoices = invoices.filter(i => i.userEmail === user.email);
    
    const tbody = document.getElementById("history-table-body");
    tbody.innerHTML = "";
    
    if (userInvoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">No invoices found. Write your first one today!</td></tr>`;
        return;
    }
    
    // Sort chronological descending
    const sorted = [...userInvoices].sort((a,b) => b.timestamp - a.timestamp);
    
    sorted.forEach(inv => {
        const tr = document.createElement("tr");
        const sym = getCountryMeta(inv.country).symbol;
        const amtStr = `${sym}${parseFloat(inv.grandTotal).toFixed(2)}`;
        const statusClass = inv.status === 'Paid' ? 'paid' : 'outstanding';
        
        tr.innerHTML = `
            <td><strong>${inv.invoiceNumber}</strong></td>
            <td>${inv.clientName}</td>
            <td><span class="badge-tag">${inv.country}</span></td>
            <td>${formatDateString(inv.issueDate)}</td>
            <td>${amtStr}</td>
            <td>
                <span class="status-badge ${statusClass}" onclick="toggleInvoicePaidStatus('${inv.id}')" title="Click to toggle Paid/Outstanding" style="cursor:pointer">
                    ${inv.status}
                </span>
            </td>
            <td class="text-right">
                <div class="flex gap-2" style="justify-content: flex-end;">
                    <button class="btn btn-sm btn-outline" onclick="editInvoice('${inv.id}')" title="Edit invoice">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="openShareModalDirect('${inv.id}')" title="Share invoice text/email/whatsapp">
                        <i data-lucide="share-2"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="printInvoiceDirect('${inv.id}')" title="Print invoice">
                        <i data-lucide="printer"></i>
                    </button>
                    <button class="btn btn-sm btn-text-danger" onclick="deleteInvoice('${inv.id}')" title="Delete invoice">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

// Trigger share dialog from history table actions
function openShareModalDirect(id) {
    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    const inv = invoices.find(i => i.id === id);
    if (inv) openShareModal(inv);
}

// Loads invoice details to Preview canvas and triggers print directly
function printInvoiceDirect(id) {
    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    
    // Load into preview sheet
    editInvoice(id);
    // Slight delay to ensure preview renders correctly before native print dialog opens
    setTimeout(() => {
        window.print();
    }, 300);
}

/* --- Client Directory Setup --- */
function loadClientDirectory() {
    const user = getActiveUser();
    if (!user) return;
    
    const clients = JSON.parse(localStorage.getItem("horizon_clients") || "[]");
    const userClients = clients.filter(c => c.userEmail === user.email);
    
    const listContainer = document.getElementById("clients-list-container");
    listContainer.innerHTML = "";
    
    // Also build choices list inside invoice selector dropdown
    const select = document.getElementById("inv-client-selector");
    select.innerHTML = '<option value="">-- Quick Load Saved Client --</option>';
    
    if (userClients.length === 0) {
        listContainer.innerHTML = `<p class="text-center text-muted py-4">No clients saved. Clients are added automatically when you save invoices, or you can create one manually.</p>`;
        return;
    }
    
    userClients.forEach(c => {
        // Add to client database view list
        const card = document.createElement("div");
        card.className = "client-item-card";
        card.innerHTML = `
            <div class="client-item-info">
                <h4>${c.name}</h4>
                <p>${c.email} | ${c.phone || 'No phone'}</p>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-sm btn-outline" onclick="loadClientToForm('${c.id}')"><i data-lucide="edit-2"></i></button>
                <button class="btn btn-sm btn-text-danger" onclick="deleteClient('${c.id}')"><i data-lucide="trash"></i></button>
            </div>
        `;
        listContainer.appendChild(card);
        
        // Add to creator dropdown options
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.innerText = c.name;
        select.appendChild(opt);
    });
    
    lucide.createIcons();
}

function openAddClientModal() {
    document.getElementById("client-panel-title").innerText = "Add Client";
    document.getElementById("edit-client-id").value = "";
    document.getElementById("client-editor-form").reset();
}

function handleSaveClient(event) {
    event.preventDefault();
    const user = getActiveUser();
    if (!user) return;
    
    const name = document.getElementById("client-name").value.trim();
    const email = document.getElementById("client-email").value.trim();
    const phone = document.getElementById("client-phone").value.trim();
    const address = document.getElementById("client-address").value.trim();
    const taxReg = document.getElementById("client-tax-reg").value.trim();
    const editId = document.getElementById("edit-client-id").value;
    
    const clients = JSON.parse(localStorage.getItem("horizon_clients") || "[]");
    
    if (editId) {
        const index = clients.findIndex(c => c.id === editId);
        if (index !== -1) {
            clients[index] = { ...clients[index], name, email, phone, address, taxReg };
            showToast("Client updated successfully.", "check");
        }
    } else {
        clients.push({
            id: 'cli_' + Date.now(),
            userEmail: user.email,
            name, email, phone, address, taxReg
        });
        showToast("Client added to database.", "check");
    }
    
    localStorage.setItem("horizon_clients", JSON.stringify(clients));
    document.getElementById("client-editor-form").reset();
    document.getElementById("edit-client-id").value = "";
    document.getElementById("client-panel-title").innerText = "Add Client";
    
    loadClientDirectory();
}

function loadClientToForm(id) {
    const clients = JSON.parse(localStorage.getItem("horizon_clients") || "[]");
    const c = clients.find(item => item.id === id);
    if (!c) return;
    
    document.getElementById("client-panel-title").innerText = "Edit Client";
    document.getElementById("edit-client-id").value = c.id;
    document.getElementById("client-name").value = c.name;
    document.getElementById("client-email").value = c.email;
    document.getElementById("client-phone").value = c.phone || "";
    document.getElementById("client-address").value = c.address || "";
    document.getElementById("client-tax-reg").value = c.taxReg || "";
}

function deleteClient(id) {
    if (!confirm("Remove this client from the directory?")) return;
    let clients = JSON.parse(localStorage.getItem("horizon_clients") || "[]");
    clients = clients.filter(c => c.id !== id);
    localStorage.setItem("horizon_clients", JSON.stringify(clients));
    
    showToast("Client deleted.", "trash");
    loadClientDirectory();
}

// Creator Autofills Billing fields when client selector is triggered
function autofillClientDetails() {
    const selectedId = document.getElementById("inv-client-selector").value;
    if (!selectedId) return;
    
    const clients = JSON.parse(localStorage.getItem("horizon_clients") || "[]");
    const c = clients.find(item => item.id === selectedId);
    if (!c) return;
    
    document.getElementById("inv-client-name").value = c.name;
    document.getElementById("inv-client-email").value = c.email;
    document.getElementById("inv-client-phone").value = c.phone || "";
    document.getElementById("inv-client-address").value = c.address || "";
    document.getElementById("inv-client-tax-reg").value = c.taxReg || "";
    
    updatePreview();
}

/* --- Business Settings Logic --- */
function loadSettings() {
    const user = getActiveUser();
    if (!user) return;
    
    document.getElementById("set-company-name").value = user.companyName;
    document.getElementById("set-company-email").value = user.email;
    document.getElementById("set-company-phone").value = user.phone || "";
    document.getElementById("set-company-address").value = user.address || "";
    document.getElementById("set-default-country").value = user.country || "US";
    document.getElementById("set-company-tax-id").value = user.taxId || "";
    
    // Logo render
    const logoPrev = document.getElementById("settings-logo-preview");
    if (user.logo) {
        logoPrev.innerHTML = `<img src="${user.logo}" alt="Company Logo">`;
    } else {
        const initials = user.companyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        logoPrev.innerHTML = `<span>${initials}</span>`;
    }

    // Load defaults info
    const pay = user.payment || {};
    document.getElementById("set-default-payment-type").value = pay.type || "bank";
    document.getElementById("set-bank-name").value = pay.bankName || "";
    document.getElementById("set-bank-acc").value = pay.bankAccount || "";
    document.getElementById("set-bank-routing").value = pay.bankRouting || "";
    
    document.getElementById("set-upi-id").value = pay.upiId || "";
    document.getElementById("set-upi-name").value = pay.upiName || "";
    document.getElementById("set-paypal-id").value = pay.paypalId || "";
    document.getElementById("set-custom-url").value = pay.customUrl || "";
    
    document.getElementById("set-default-notes").value = pay.notes || "";
    
    handleSettingsCountryChange();
    toggleSettingsQRFields();
}

function handleSettingsCountryChange() {
    const country = document.getElementById("set-default-country").value;
    const meta = getCountryMeta(country);
    
    const label = document.getElementById("set-tax-reg-label");
    label.innerText = `Company ${meta.taxCode} Registration #`;
}

function toggleSettingsQRFields() {
    const type = document.getElementById("set-default-payment-type").value;
    
    document.getElementById("set-qr-bank").classList.add("hidden");
    document.getElementById("set-qr-upi").classList.add("hidden");
    document.getElementById("set-qr-paypal").classList.add("hidden");
    document.getElementById("set-qr-custom").classList.add("hidden");
    
    if (type === "bank") {
        document.getElementById("set-qr-bank").classList.remove("hidden");
    } else if (type === "upi") {
        document.getElementById("set-qr-upi").classList.remove("hidden");
    } else if (type === "paypal") {
        document.getElementById("set-qr-paypal").classList.remove("hidden");
    } else if (type === "custom") {
        document.getElementById("set-qr-custom").classList.remove("hidden");
    }
}

// Profile Save Handler
function handleSaveSettings(event) {
    event.preventDefault();
    const user = getActiveUser();
    if (!user) return;
    
    const companyName = document.getElementById("set-company-name").value.trim();
    const email = document.getElementById("set-company-email").value.trim().toLowerCase();
    const phone = document.getElementById("set-company-phone").value.trim();
    const address = document.getElementById("set-company-address").value.trim();
    const country = document.getElementById("set-default-country").value;
    const taxId = document.getElementById("set-company-tax-id").value.trim();
    
    // Save record
    const success = saveActiveUser({
        companyName,
        email,
        phone,
        address,
        country,
        taxId
    });
    
    if (success) {
        showToast("Company profile updated successfully.", "check-circle");
        initDashboard();
    } else {
        showToast("Error saving profile details.", "x-circle");
    }
}

// Default payment Save Handler
function savePaymentDefaults() {
    const user = getActiveUser();
    if (!user) return;
    
    const type = document.getElementById("set-default-payment-type").value;
    const bankName = document.getElementById("set-bank-name").value.trim();
    const bankAccount = document.getElementById("set-bank-acc").value.trim();
    const bankRouting = document.getElementById("set-bank-routing").value.trim();
    
    const upiId = document.getElementById("set-upi-id").value.trim();
    const upiName = document.getElementById("set-upi-name").value.trim();
    const paypalId = document.getElementById("set-paypal-id").value.trim();
    const customUrl = document.getElementById("set-custom-url").value.trim();
    const notes = document.getElementById("set-default-notes").value;
    
    const success = saveActiveUser({
        payment: {
            type, bankName, bankAccount, bankRouting, upiId, upiName, paypalId, customUrl, notes
        }
    });
    
    if (success) {
        showToast("Payment defaults updated.", "check-circle");
    } else {
        showToast("Error saving payments profile.", "x-circle");
    }
}

// Logo image upload logic (Converts uploaded image to base64 DataURL)
function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 500 * 1024) {
        showToast("Image exceeds 500KB limit.", "alert-triangle");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Image = e.target.result;
        
        // Save base64 image into current profile
        const success = saveActiveUser({ logo: base64Image });
        if (success) {
            showToast("Company logo updated.", "check");
            loadSettings(); // refresh page view
            updatePreview(); // refresh builder active sheet
        }
    };
    reader.readAsDataURL(file);
}

function clearLogoUpload() {
    const success = saveActiveUser({ logo: "" });
    if (success) {
        showToast("Logo removed.", "check");
        loadSettings();
        updatePreview();
    }
}

/* --- Toast Notifications Helper --- */
let toastTimeout = null;
function showToast(message, iconName = "info") {
    const toast = document.getElementById("toast");
    const msgSpan = document.getElementById("toast-message");
    const iconSpan = document.getElementById("toast-icon");
    
    if (!toast) return;
    
    clearTimeout(toastTimeout);
    
    msgSpan.innerText = message;
    iconSpan.setAttribute("data-lucide", iconName);
    lucide.createIcons();
    
    toast.classList.remove("hidden");
    
    toastTimeout = setTimeout(() => {
        toast.classList.add("hidden");
    }, 3500);
}

/* --- Data Portability Helpers --- */
function exportLocalDataBackup() {
    try {
        const backup = {
            users: JSON.parse(localStorage.getItem("horizon_users") || "[]"),
            invoices: JSON.parse(localStorage.getItem("horizon_invoices") || "[]"),
            clients: JSON.parse(localStorage.getItem("horizon_clients") || "[]"),
            theme: localStorage.getItem("horizon_theme") || "dark"
        };
        
        const jsonStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const today = new Date().toISOString().split('T')[0];
        const a = document.createElement("a");
        a.href = url;
        a.download = `horizonget_backup_${today}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast("Backup exported successfully!", "check-circle");
    } catch (e) {
        console.error("Backup export failed", e);
        showToast("Failed to export data.", "alert-triangle");
    }
}

function importLocalDataBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Basic structure validation
            if (!data || !Array.isArray(data.users) || !Array.isArray(data.invoices) || !Array.isArray(data.clients)) {
                throw new Error("Invalid backup file format. Missing standard tables.");
            }
            
            const confirmImport = confirm("Are you sure you want to import this backup? This will overwrite all your current browser invoices, settings, and users.");
            if (!confirmImport) {
                event.target.value = "";
                return;
            }
            
            // Save to localStorage
            localStorage.setItem("horizon_users", JSON.stringify(data.users));
            localStorage.setItem("horizon_invoices", JSON.stringify(data.invoices));
            localStorage.setItem("horizon_clients", JSON.stringify(data.clients));
            
            if (data.theme) {
                localStorage.setItem("horizon_theme", data.theme);
                document.documentElement.setAttribute("data-theme", data.theme);
                updateThemeUI(data.theme);
            }
            
            showToast("Backup restored successfully!", "check-circle");
            
            // Force reload current view state or reset session check
            checkAuth();
            if (localStorage.getItem("horizon_session")) {
                initDashboard();
                initHistoryTable();
                loadClientDirectory();
                loadSettings();
            }
        } catch (err) {
            console.error("Backup import failed", err);
            showToast("Failed to restore backup: " + err.message, "alert-triangle");
        } finally {
            event.target.value = "";
        }
    };
    reader.readAsText(file);
}

function wipeAllLocalData() {
    const confirm1 = confirm("WARNING: This will permanently delete ALL your local users, profiles, client databases, and invoices from this browser. This action cannot be undone.");
    if (!confirm1) return;
    
    const confirm2 = confirm("Are you absolutely sure you want to perform a full wipe? Please make sure you have exported a backup JSON file first!");
    if (!confirm2) return;
    
    // Clear storage
    localStorage.removeItem("horizon_users");
    localStorage.removeItem("horizon_session");
    localStorage.removeItem("horizon_invoices");
    localStorage.removeItem("horizon_clients");
    
    showToast("All local data wiped successfully.", "trash-2");

    // Force logout / reload auth screen
    handleLogout();
}

/* ==========================================================================
   ADMIN PANEL
   ========================================================================== */

function initAdminPanel() {
    const user = getActiveUser();
    if (!user || !user.isAdmin) {
        showToast("Access denied.", "shield-off");
        switchTab('dashboard');
        return;
    }
    loadTenantsTable();
    loadAdminPricingTable();
}

function loadTenantsTable() {
    const users = JSON.parse(localStorage.getItem("horizon_users") || "[]");
    const tbody = document.getElementById("admin-tenants-body");
    if (!tbody) return;

    const tenants = users.filter(u => !u.isAdmin);
    if (tenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No tenants registered yet.</td></tr>';
        return;
    }

    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    tbody.innerHTML = tenants.map(u => {
        const userInvoiceCount = invoices.filter(inv => inv.senderEmail === u.email).length;
        return `<tr>
            <td><strong>${u.name}</strong></td>
            <td>${u.companyName || '—'}</td>
            <td>${u.email}</td>
            <td>${getCountryMeta(u.country).name}</td>
            <td>${userInvoiceCount}</td>
            <td class="text-right">
                <button class="btn btn-sm btn-text-danger" onclick="deleteTenant('${u.email}')">
                    <i data-lucide="user-x"></i>
                    <span>Remove</span>
                </button>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

function deleteTenant(email) {
    if (!confirm(`Remove tenant account "${email}"? This cannot be undone.`)) return;
    let users = JSON.parse(localStorage.getItem("horizon_users") || "[]");
    users = users.filter(u => u.email !== email);
    localStorage.setItem("horizon_users", JSON.stringify(users));
    showToast("Tenant removed.", "check-circle");
    loadTenantsTable();
}

function loadAdminPricingTable() {
    const overrides = JSON.parse(localStorage.getItem("horizon_admin_pricing") || "{}");
    const tbody = document.getElementById("admin-pricing-body");
    if (!tbody) return;

    tbody.innerHTML = Object.entries(COUNTRY_REGISTRY).map(([code, meta]) => {
        const rate = overrides[code] !== undefined ? overrides[code] : meta.defaultTaxRate;
        return `<tr>
            <td>${meta.name}</td>
            <td>${meta.symbol}</td>
            <td>${meta.taxLabel}</td>
            <td>
                <input type="number" class="admin-rate-input" data-country="${code}"
                       value="${rate}" min="0" max="100" step="0.01">
            </td>
        </tr>`;
    }).join('');
}

function saveAdminPricing() {
    const inputs = document.querySelectorAll(".admin-rate-input");
    const overrides = {};
    inputs.forEach(input => {
        overrides[input.dataset.country] = parseFloat(input.value) || 0;
    });
    localStorage.setItem("horizon_admin_pricing", JSON.stringify(overrides));
    showToast("Pricing configuration saved.", "check-circle");
}
