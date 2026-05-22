/* ==========================================================================
   HORIZONGET INVOICE CONTROLLER & CALCULATIONS
   ========================================================================== */

let activeInvoiceId = null; // Stored if editing an existing invoice
let itemRowCounter = 0;

// Initialize blank row on load
function initInvoiceBuilder() {
    resetInvoiceBuilder();
}

// Reset builder form to default state
function resetInvoiceBuilder() {
    activeInvoiceId = null;
    document.getElementById("builder-title").innerText = "New Invoice";
    document.getElementById("save-btn-text").innerText = "Save Invoice";
    
    // Set dates default
    const today = new Date().toISOString().split('T')[0];
    const nextFortnight = new Date();
    nextFortnight.setDate(nextFortnight.getDate() + 14);
    const dueDate = nextFortnight.toISOString().split('T')[0];
    
    document.getElementById("inv-date").value = today;
    document.getElementById("inv-due-date").value = dueDate;
    
    // Reset Client Info
    document.getElementById("inv-client-selector").value = "";
    document.getElementById("inv-client-name").value = "";
    document.getElementById("inv-client-email").value = "";
    document.getElementById("inv-client-phone").value = "";
    document.getElementById("inv-client-address").value = "";
    document.getElementById("inv-client-tax-reg").value = "";
    
    // Default country from active profile
    const user = getActiveUser();
    if (user) {
        document.getElementById("inv-country").value = user.country || "US";
        document.getElementById("inv-discount").value = 0;
        
        // Auto increment invoice number based on history
        document.getElementById("inv-number").value = getNextInvoiceNumber();
    }
    
    // Clear items list and create a single blank row
    const container = document.getElementById("items-list-container");
    container.innerHTML = "";
    itemRowCounter = 0;
    addInvoiceItemRow("Development Services", 1, 1200);
    
    // Load payment defaults
    loadInvoicePaymentDefaults();
    
    handleInvoiceCountryChange(); // Triggers preview update
}

// Computes next invoice code dynamically
function getNextInvoiceNumber() {
    const user = getActiveUser();
    if (!user) return "INV-0001";
    
    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    const userInvoices = invoices.filter(i => i.userEmail === user.email);
    
    if (userInvoices.length === 0) return "INV-0001";
    
    // Search max count
    let maxNum = 0;
    userInvoices.forEach(inv => {
        const match = inv.invoiceNumber.match(/\d+/);
        if (match) {
            const val = parseInt(match[0]);
            if (val > maxNum) maxNum = val;
        }
    });
    
    const nextNum = maxNum + 1;
    return `INV-${nextNum.toString().padStart(4, '0')}`;
}

// Add row to items builder
function addInvoiceItemRow(desc = "", qty = 1, price = 0) {
    const container = document.getElementById("items-list-container");
    
    const rowId = `item-row-${itemRowCounter}`;
    const rowHTML = `
        <div class="item-row-edit" id="${rowId}">
            <div class="input-group" style="margin-bottom:0">
                <input type="text" class="item-desc" placeholder="Service / Item Description" value="${desc}" oninput="updatePreview()">
            </div>
            <div class="input-group" style="margin-bottom:0">
                <input type="number" class="item-qty" min="1" step="any" value="${qty}" oninput="updatePreview()">
            </div>
            <div class="input-group" style="margin-bottom:0">
                <input type="number" class="item-price" min="0" step="any" value="${price}" oninput="updatePreview()">
            </div>
            <button type="button" class="btn-text-danger" onclick="removeItemRow('${rowId}')" title="Delete Row">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', rowHTML);
    itemRowCounter++;
    lucide.createIcons();
    updatePreview();
}

// Remove row from items builder
function removeItemRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        updatePreview();
    }
}

// Triggered when country selection changes in Creator
function handleInvoiceCountryChange() {
    const country = document.getElementById("inv-country").value;
    const meta = getCountryMeta(country);
    
    // Update labels and values
    document.getElementById("inv-tax-rate").value = meta.defaultTaxRate;
    
    // Set client tax label dynamically
    const clientTaxContainer = document.getElementById("client-tax-reg-container");
    const clientTaxLabel = document.getElementById("client-tax-reg-label");
    
    if (meta.taxLabel === "Sales Tax") {
        clientTaxContainer.classList.add("hidden");
    } else {
        clientTaxContainer.classList.remove("hidden");
        clientTaxLabel.innerText = `Client ${meta.taxCode} Registration`;
    }
    
    updatePreview();
}

// Load default payment instructions configured in Settings tab
function loadInvoicePaymentDefaults() {
    const user = getActiveUser();
    if (!user || !user.payment) return;
    
    const payment = user.payment;
    document.getElementById("inv-payment-type").value = payment.type || "bank";
    
    document.getElementById("inv-bank-name").value = payment.bankName || "";
    document.getElementById("inv-bank-acc").value = payment.bankAccount || "";
    document.getElementById("inv-bank-routing").value = payment.bankRouting || "";
    
    document.getElementById("inv-upi-id").value = payment.upiId || "";
    document.getElementById("inv-upi-name").value = payment.upiName || "";
    
    document.getElementById("inv-paypal-url").value = payment.paypalId || "";
    document.getElementById("inv-custom-url").value = payment.customUrl || "";
    
    document.getElementById("inv-notes").value = payment.notes || "";
    
    toggleQRDetails();
}

// Toggle input visibility in settings/invoice forms based on QR type selection
function toggleQRDetails() {
    const type = document.getElementById("inv-payment-type").value;
    
    document.getElementById("qr-bank-details").classList.add("hidden");
    document.getElementById("qr-upi-details").classList.add("hidden");
    document.getElementById("qr-paypal-details").classList.add("hidden");
    document.getElementById("qr-custom-details").classList.add("hidden");
    
    if (type === "bank") {
        document.getElementById("qr-bank-details").classList.remove("hidden");
    } else if (type === "upi") {
        document.getElementById("qr-upi-details").classList.remove("hidden");
    } else if (type === "paypal") {
        document.getElementById("qr-paypal-details").classList.remove("hidden");
    } else if (type === "custom") {
        document.getElementById("qr-custom-details").classList.remove("hidden");
    }
    
    updatePreview();
}

// Re-computes and syncs state to the A4 page preview sheet
function updatePreview() {
    const user = getActiveUser();
    if (!user) return;
    
    const country = document.getElementById("inv-country").value;
    const meta = getCountryMeta(country);
    const currency = meta.symbol;
    
    // 1. Sender Info
    document.getElementById("prev-sender-name").innerText = user.companyName || "My Business";
    document.getElementById("prev-sender-address").innerText = user.address || "";
    document.getElementById("prev-sender-contact").innerText = `Email: ${user.email} | Phone: ${user.phone || 'N/A'}`;
    
    const senderTaxEl = document.getElementById("prev-sender-tax-id");
    if (user.taxId) {
        senderTaxEl.innerText = `${meta.taxCode}: ${user.taxId}`;
        senderTaxEl.classList.remove("hidden");
    } else {
        senderTaxEl.classList.add("hidden");
    }
    
    // Logo render ( initials or image )
    const logoContainer = document.getElementById("preview-logo-container");
    if (user.logo) {
        logoContainer.innerHTML = `<img src="${user.logo}" alt="Company Logo">`;
    } else {
        const initials = (user.companyName || "HG").split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        logoContainer.innerHTML = `<span class="preview-initials" id="preview-logo-initials">${initials}</span>`;
    }

    // 2. Client Info
    const clientName = document.getElementById("inv-client-name").value || "Client Company";
    const clientEmail = document.getElementById("inv-client-email").value || "billing@client.com";
    const clientPhone = document.getElementById("inv-client-phone").value || "";
    const clientAddress = document.getElementById("inv-client-address").value || "";
    const clientTaxReg = document.getElementById("inv-client-tax-reg").value || "";
    
    document.getElementById("prev-client-name").innerText = clientName;
    document.getElementById("prev-client-email").innerText = `Email: ${clientEmail}`;
    document.getElementById("prev-client-phone").innerText = clientPhone ? `Phone: ${clientPhone}` : "";
    document.getElementById("prev-client-address").innerText = clientAddress;
    
    const clientTaxEl = document.getElementById("prev-client-tax-id");
    if (clientTaxReg && meta.taxLabel !== "Sales Tax") {
        clientTaxEl.innerText = `${meta.taxCode}: ${clientTaxReg}`;
        clientTaxEl.classList.remove("hidden");
    } else {
        clientTaxEl.classList.add("hidden");
    }

    // 3. Invoice Meta
    const invNumber = document.getElementById("inv-number").value || "INV-0001";
    const invDateStr = document.getElementById("inv-date").value;
    const dueDateStr = document.getElementById("inv-due-date").value;
    
    document.getElementById("prev-inv-number").innerText = invNumber;
    document.getElementById("prev-inv-date").innerText = formatDateString(invDateStr);
    document.getElementById("prev-inv-due-date").innerText = formatDateString(dueDateStr);
    
    document.getElementById("prev-country-label").innerText = meta.name;
    document.getElementById("prev-tax-system-badge").innerText = `${meta.taxLabel} Enabled`;

    // 4. Items Table Computations
    const itemsBody = document.getElementById("prev-items-body");
    itemsBody.innerHTML = "";
    
    let subtotal = 0;
    
    const editRows = document.querySelectorAll("#items-list-container .item-row-edit");
    editRows.forEach(row => {
        const desc = row.querySelector(".item-desc").value || "Services Rendered";
        const qty = parseFloat(row.querySelector(".item-qty").value) || 0;
        const price = parseFloat(row.querySelector(".item-price").value) || 0;
        const total = qty * price;
        
        subtotal += total;
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${desc}</td>
            <td class="text-right">${qty}</td>
            <td class="text-right">${currency}${price.toFixed(2)}</td>
            <td class="text-right">${currency}${total.toFixed(2)}</td>
        `;
        itemsBody.appendChild(tr);
    });
    
    // In case no items
    if (editRows.length === 0) {
        itemsBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No items added.</td></tr>`;
    }

    // Math Totals
    const discount = parseFloat(document.getElementById("inv-discount").value) || 0;
    const taxRate = parseFloat(document.getElementById("inv-tax-rate").value) || 0;
    
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = taxableAmount * (taxRate / 100);
    const grandTotal = taxableAmount + taxAmount;
    
    document.getElementById("prev-subtotal").innerText = `${currency}${subtotal.toFixed(2)}`;
    
    const discountRow = document.getElementById("prev-discount-row");
    if (discount > 0) {
        discountRow.classList.remove("hidden");
        document.getElementById("prev-discount").innerText = `-${currency}${discount.toFixed(2)}`;
    } else {
        discountRow.classList.add("hidden");
    }
    
    document.getElementById("prev-tax-label").innerText = `${meta.taxLabel} (${taxRate}%)`;
    document.getElementById("prev-tax").innerText = `${currency}${taxAmount.toFixed(2)}`;
    document.getElementById("prev-grand-total").innerText = `${currency}${grandTotal.toFixed(2)}`;

    // 5. Payment details and QR Code Engine
    const notes = document.getElementById("inv-notes").value;
    document.getElementById("prev-payment-memo").innerText = notes || "Payment is due upon receipt.";
    
    generatePaymentQRCode(grandTotal, meta);
}

// Builds payment strings and draws QR code via lib/api fallback
function generatePaymentQRCode(amount, countryMeta) {
    const pType = document.getElementById("inv-payment-type").value;
    const qrContainer = document.getElementById("qrcode-canvas");
    
    if (!qrContainer) return;
    qrContainer.innerHTML = "";
    
    let qrPayload = "";
    let desc = "";
    
    if (pType === "upi") {
        const upiId = document.getElementById("inv-upi-id").value.trim();
        const payeeName = document.getElementById("inv-upi-name").value.trim() || "HorizonGET Merchant";
        
        if (upiId) {
            qrPayload = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR`;
            desc = `Instant payment via UPI app to ${upiId}.`;
        } else {
            qrPayload = "Complete settings default values for UPI payments.";
            desc = "Awaiting payee credentials.";
        }
    } else if (pType === "paypal") {
        const paypalId = document.getElementById("inv-paypal-url").value.trim();
        if (paypalId) {
            qrPayload = `https://www.paypal.me/${paypalId}/${amount.toFixed(2)}`;
            desc = `Direct settlement via PayPal gateway to @${paypalId}.`;
        } else {
            qrPayload = "https://www.paypal.me";
            desc = "Awaiting PayPal account name.";
        }
    } else if (pType === "custom") {
        const url = document.getElementById("inv-custom-url").value.trim();
        if (url) {
            qrPayload = url;
            desc = `Scan code to open custom checkout portal.`;
        } else {
            qrPayload = "https://horizonget.com";
            desc = "Default HorizonGET checkout portal link.";
        }
    } else {
        // Banking Details
        const bankName = document.getElementById("inv-bank-name").value.trim();
        const acc = document.getElementById("inv-bank-acc").value.trim();
        const swift = document.getElementById("inv-bank-routing").value.trim();
        
        if (acc) {
            qrPayload = `Bank: ${bankName}\nAccount/IBAN: ${acc}\nSWIFT/BIC: ${swift}\nAmount: ${countryMeta.symbol}${amount.toFixed(2)}`;
            desc = `Wire transfer coordinates for account ${acc.substring(0,6)}...`;
        } else {
            qrPayload = "Payment details outstanding.";
            desc = "Awaiting bank specifications.";
        }
    }
    
    document.getElementById("prev-qr-payment-desc").innerText = desc;
    
    // Draw QR Code
    try {
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: qrPayload,
                width: 64,
                height: 64,
                colorDark: "#111827",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        } else {
            // Fallback API if library loading got blocked
            const srcUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrPayload)}`;
            qrContainer.innerHTML = `<img src="${srcUrl}" alt="QR code link" style="width:64px;height:64px;">`;
        }
    } catch (e) {
        console.error("QR Code rendering failed", e);
        qrContainer.innerHTML = `<span style="font-size:8px;color:#ef4444;text-align:center">Error generating QR</span>`;
    }
}

// Saves draft or updates existing record in Database (localStorage)
function saveActiveInvoice() {
    const user = getActiveUser();
    if (!user) return;
    
    const clientName = document.getElementById("inv-client-name").value.trim();
    if (!clientName) {
        showToast("Please specify client name.", "alert-triangle");
        return;
    }
    
    const invNumber = document.getElementById("inv-number").value.trim();
    const invDate = document.getElementById("inv-date").value;
    const dueDate = document.getElementById("inv-due-date").value;
    const country = document.getElementById("inv-country").value;
    const discount = parseFloat(document.getElementById("inv-discount").value) || 0;
    const taxRate = parseFloat(document.getElementById("inv-tax-rate").value) || 0;
    
    const paymentType = document.getElementById("inv-payment-type").value;
    const bankName = document.getElementById("inv-bank-name").value.trim();
    const bankAccount = document.getElementById("inv-bank-acc").value.trim();
    const bankRouting = document.getElementById("inv-bank-routing").value.trim();
    const upiId = document.getElementById("inv-upi-id").value.trim();
    const upiName = document.getElementById("inv-upi-name").value.trim();
    const paypalId = document.getElementById("inv-paypal-url").value.trim();
    const customUrl = document.getElementById("inv-custom-url").value.trim();
    const notes = document.getElementById("inv-notes").value;
    
    // Line items gather
    const items = [];
    let subtotal = 0;
    const editRows = document.querySelectorAll("#items-list-container .item-row-edit");
    
    editRows.forEach(row => {
        const desc = row.querySelector(".item-desc").value || "Services";
        const qty = parseFloat(row.querySelector(".item-qty").value) || 0;
        const price = parseFloat(row.querySelector(".item-price").value) || 0;
        const total = qty * price;
        subtotal += total;
        
        items.push({ description: desc, quantity: qty, price, total });
    });
    
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = taxableAmount * (taxRate / 100);
    const grandTotal = taxableAmount + taxAmount;
    
    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    
    const invoicePayload = {
        id: activeInvoiceId || 'inv_' + Date.now(),
        userEmail: user.email,
        senderName: user.companyName,
        invoiceNumber: invNumber,
        issueDate: invDate,
        dueDate: dueDate,
        country,
        clientName,
        clientEmail: document.getElementById("inv-client-email").value.trim(),
        clientPhone: document.getElementById("inv-client-phone").value.trim(),
        clientAddress: document.getElementById("inv-client-address").value.trim(),
        clientTaxReg: document.getElementById("inv-client-tax-reg").value.trim(),
        items,
        subtotal,
        discount,
        taxRate,
        taxAmount,
        grandTotal,
        paymentType,
        bankName,
        bankAccount,
        bankRouting,
        upiId,
        upiName,
        paypalId,
        customUrl,
        notes,
        status: "Outstanding",
        timestamp: Date.now()
    };
    
    if (activeInvoiceId) {
        // Edit mode
        const index = invoices.findIndex(i => i.id === activeInvoiceId);
        if (index !== -1) {
            invoices[index] = invoicePayload;
            showToast("Invoice updated successfully!", "check-circle");
        }
    } else {
        // Check uniqueness of inv number for this specific user
        const duplicate = invoices.some(i => i.userEmail === user.email && i.invoiceNumber === invNumber);
        if (duplicate) {
            showToast(`Invoice number ${invNumber} already exists.`, "alert-triangle");
            return;
        }
        
        invoices.push(invoicePayload);
        showToast("Invoice created and saved!", "check-circle");
    }
    
    localStorage.setItem("horizon_invoices", JSON.stringify(invoices));
    
    // Save Client automatically to directory if not already saved
    saveClientImplicitly({
        name: clientName,
        email: invoicePayload.clientEmail,
        phone: invoicePayload.clientPhone,
        address: invoicePayload.clientAddress,
        taxReg: invoicePayload.clientTaxReg
    });
    
    // Reset and return
    initDashboard();
    initHistoryTable();
    switchTab('history');
}

// Edit saved invoice
function editInvoice(id) {
    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    
    activeInvoiceId = inv.id;
    document.getElementById("builder-title").innerText = `Edit Invoice ${inv.invoiceNumber}`;
    document.getElementById("save-btn-text").innerText = "Update Invoice";
    
    document.getElementById("inv-number").value = inv.invoiceNumber;
    document.getElementById("inv-date").value = inv.issueDate;
    document.getElementById("inv-due-date").value = inv.dueDate;
    document.getElementById("inv-country").value = inv.country;
    
    document.getElementById("inv-client-name").value = inv.clientName;
    document.getElementById("inv-client-email").value = inv.clientEmail || "";
    document.getElementById("inv-client-phone").value = inv.clientPhone || "";
    document.getElementById("inv-client-address").value = inv.clientAddress || "";
    document.getElementById("inv-client-tax-reg").value = inv.clientTaxReg || "";
    
    document.getElementById("inv-discount").value = inv.discount;
    document.getElementById("inv-tax-rate").value = inv.taxRate;
    
    document.getElementById("inv-payment-type").value = inv.paymentType;
    document.getElementById("inv-bank-name").value = inv.bankName || "";
    document.getElementById("inv-bank-acc").value = inv.bankAccount || "";
    document.getElementById("inv-bank-routing").value = inv.bankRouting || "";
    document.getElementById("inv-upi-id").value = inv.upiId || "";
    document.getElementById("inv-upi-name").value = inv.upiName || "";
    document.getElementById("inv-paypal-url").value = inv.paypalId || "";
    document.getElementById("inv-custom-url").value = inv.customUrl || "";
    document.getElementById("inv-notes").value = inv.notes || "";
    
    // Dynamic rows restore
    const container = document.getElementById("items-list-container");
    container.innerHTML = "";
    itemRowCounter = 0;
    
    inv.items.forEach(item => {
        addInvoiceItemRow(item.description, item.quantity, item.price);
    });
    
    toggleQRDetails();
    handleInvoiceCountryChange();
    switchTab('create');
}

// Toggles mark as paid state in history tables
function toggleInvoicePaidStatus(id) {
    const invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    const index = invoices.findIndex(i => i.id === id);
    if (index !== -1) {
        const nextStatus = invoices[index].status === "Paid" ? "Outstanding" : "Paid";
        invoices[index].status = nextStatus;
        localStorage.setItem("horizon_invoices", JSON.stringify(invoices));
        
        showToast(`Invoice status updated to ${nextStatus}`, "check");
        initDashboard();
        initHistoryTable();
    }
}

// Delete Invoice
function deleteInvoice(id) {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    
    let invoices = JSON.parse(localStorage.getItem("horizon_invoices") || "[]");
    invoices = invoices.filter(i => i.id !== id);
    localStorage.setItem("horizon_invoices", JSON.stringify(invoices));
    
    showToast("Invoice deleted.", "trash");
    initDashboard();
    initHistoryTable();
}

// Quick helper to format dates nicely on sheets
function formatDateString(str) {
    if (!str) return "N/A";
    const date = new Date(str);
    if (isNaN(date.getTime())) return str;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Add/Save client implicitly when saving invoices
function saveClientImplicitly(clientMeta) {
    const user = getActiveUser();
    if (!user) return;
    
    const clients = JSON.parse(localStorage.getItem("horizon_clients") || "[]");
    const exists = clients.some(c => c.userEmail === user.email && c.name.toLowerCase() === clientMeta.name.toLowerCase());
    
    if (!exists) {
        clients.push({
            id: 'cli_' + Date.now(),
            userEmail: user.email,
            name: clientMeta.name,
            email: clientMeta.email,
            phone: clientMeta.phone,
            address: clientMeta.address,
            taxReg: clientMeta.taxReg
        });
        localStorage.setItem("horizon_clients", JSON.stringify(clients));
        loadClientDirectory();
    }
}
