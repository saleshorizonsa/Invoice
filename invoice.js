/* ==========================================================================
   HORIZONGET INVOICE CONTROLLER & CALCULATIONS (API-backed)
   ========================================================================== */

let activeInvoiceId = null;
let itemRowCounter  = 0;

function initInvoiceBuilder() { resetInvoiceBuilder(); }

function resetInvoiceBuilder() {
    activeInvoiceId = null;
    document.getElementById("builder-title").innerText = "New Invoice";
    document.getElementById("save-btn-text").innerText = "Save Invoice";

    const today         = new Date().toISOString().split('T')[0];
    const nextFortnight = new Date();
    nextFortnight.setDate(nextFortnight.getDate() + 14);
    document.getElementById("inv-date").value     = today;
    document.getElementById("inv-due-date").value = nextFortnight.toISOString().split('T')[0];

    document.getElementById("inv-client-selector").value = "";
    ["inv-client-name","inv-client-email","inv-client-phone","inv-client-address","inv-client-tax-reg"]
        .forEach(id => { document.getElementById(id).value = ""; });

    const user = getActiveUser();
    if (user) {
        document.getElementById("inv-country").value  = user.country || "US";
        document.getElementById("inv-discount").value = 0;
        document.getElementById("inv-number").value   = getNextInvoiceNumber();
    }

    document.getElementById("items-list-container").innerHTML = "";
    itemRowCounter = 0;
    addInvoiceItemRow("Development Services", 1, 1200);

    loadInvoicePaymentDefaults();
    handleInvoiceCountryChange();
}

function getNextInvoiceNumber() {
    if (_invoices.length === 0) return "INV-0001";
    let maxNum = 0;
    _invoices.forEach(inv => {
        const match = inv.invoiceNumber.match(/\d+/);
        if (match) { const val = parseInt(match[0]); if (val > maxNum) maxNum = val; }
    });
    return `INV-${(maxNum + 1).toString().padStart(4, '0')}`;
}

function addInvoiceItemRow(desc = "", qty = 1, price = 0) {
    const container = document.getElementById("items-list-container");
    const rowId = `item-row-${itemRowCounter}`;
    container.insertAdjacentHTML('beforeend', `
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
    `);
    itemRowCounter++;
    lucide.createIcons();
    updatePreview();
}

function removeItemRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) { row.remove(); updatePreview(); }
}

function handleInvoiceCountryChange() {
    const country = document.getElementById("inv-country").value;
    const meta    = getCountryMeta(country);
    document.getElementById("inv-tax-rate").value = meta.defaultTaxRate;

    const clientTaxContainer = document.getElementById("client-tax-reg-container");
    const clientTaxLabel     = document.getElementById("client-tax-reg-label");
    if (meta.taxLabel === "Sales Tax") {
        clientTaxContainer.classList.add("hidden");
    } else {
        clientTaxContainer.classList.remove("hidden");
        clientTaxLabel.innerText = `Client ${meta.taxCode} Registration`;
    }
    updatePreview();
}

function loadInvoicePaymentDefaults() {
    const user = getActiveUser();
    if (!user || !user.payment) return;
    const payment = user.payment;

    document.getElementById("inv-payment-type").value = payment.type        || "bank";
    document.getElementById("inv-bank-name").value    = payment.bankName    || "";
    document.getElementById("inv-bank-acc").value     = payment.bankAccount || "";
    document.getElementById("inv-bank-routing").value = payment.bankRouting || "";
    document.getElementById("inv-upi-id").value       = payment.upiId       || "";
    document.getElementById("inv-upi-name").value     = payment.upiName     || "";
    document.getElementById("inv-paypal-url").value   = payment.paypalId    || "";
    document.getElementById("inv-custom-url").value   = payment.customUrl   || "";
    document.getElementById("inv-notes").value        = payment.notes       || "";
    toggleQRDetails();
}

function toggleQRDetails() {
    const type = document.getElementById("inv-payment-type").value;
    ["qr-bank-details","qr-upi-details","qr-paypal-details","qr-custom-details"]
        .forEach(id => { document.getElementById(id).classList.add("hidden"); });
    if      (type === "bank")   document.getElementById("qr-bank-details").classList.remove("hidden");
    else if (type === "upi")    document.getElementById("qr-upi-details").classList.remove("hidden");
    else if (type === "paypal") document.getElementById("qr-paypal-details").classList.remove("hidden");
    else if (type === "custom") document.getElementById("qr-custom-details").classList.remove("hidden");
    updatePreview();
}

function updatePreview() {
    const user = getActiveUser();
    if (!user) return;

    const country  = document.getElementById("inv-country").value;
    const meta     = getCountryMeta(country);
    const currency = meta.symbol;

    document.getElementById("prev-sender-name").innerText    = user.companyName || "My Business";
    document.getElementById("prev-sender-address").innerText = user.address     || "";
    document.getElementById("prev-sender-contact").innerText = `Email: ${user.email} | Phone: ${user.phone || 'N/A'}`;

    const senderTaxEl = document.getElementById("prev-sender-tax-id");
    if (user.taxId) {
        senderTaxEl.innerText = `${meta.taxCode}: ${user.taxId}`;
        senderTaxEl.classList.remove("hidden");
    } else { senderTaxEl.classList.add("hidden"); }

    const logoContainer = document.getElementById("preview-logo-container");
    if (user.logo) {
        logoContainer.innerHTML = `<img src="${user.logo}" alt="Company Logo">`;
    } else {
        const initials = (user.companyName || "HG").split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        logoContainer.innerHTML = `<span class="preview-initials" id="preview-logo-initials">${initials}</span>`;
    }

    const clientName    = document.getElementById("inv-client-name").value    || "Client Company";
    const clientEmail   = document.getElementById("inv-client-email").value   || "billing@client.com";
    const clientPhone   = document.getElementById("inv-client-phone").value   || "";
    const clientAddress = document.getElementById("inv-client-address").value || "";
    const clientTaxReg  = document.getElementById("inv-client-tax-reg").value || "";

    document.getElementById("prev-client-name").innerText    = clientName;
    document.getElementById("prev-client-email").innerText   = `Email: ${clientEmail}`;
    document.getElementById("prev-client-phone").innerText   = clientPhone ? `Phone: ${clientPhone}` : "";
    document.getElementById("prev-client-address").innerText = clientAddress;

    const clientTaxEl = document.getElementById("prev-client-tax-id");
    if (clientTaxReg && meta.taxLabel !== "Sales Tax") {
        clientTaxEl.innerText = `${meta.taxCode}: ${clientTaxReg}`;
        clientTaxEl.classList.remove("hidden");
    } else { clientTaxEl.classList.add("hidden"); }

    document.getElementById("prev-inv-number").innerText   = document.getElementById("inv-number").value || "INV-0001";
    document.getElementById("prev-inv-date").innerText     = formatDateString(document.getElementById("inv-date").value);
    document.getElementById("prev-inv-due-date").innerText = formatDateString(document.getElementById("inv-due-date").value);
    document.getElementById("prev-country-label").innerText    = meta.name;
    document.getElementById("prev-tax-system-badge").innerText = `${meta.taxLabel} Enabled`;

    const itemsBody = document.getElementById("prev-items-body");
    itemsBody.innerHTML = "";
    let subtotal = 0;

    const editRows = document.querySelectorAll("#items-list-container .item-row-edit");
    editRows.forEach(row => {
        const desc  = row.querySelector(".item-desc").value  || "Services Rendered";
        const qty   = parseFloat(row.querySelector(".item-qty").value)   || 0;
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

    if (editRows.length === 0) {
        itemsBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No items added.</td></tr>`;
    }

    const discount   = parseFloat(document.getElementById("inv-discount").value) || 0;
    const taxRate    = parseFloat(document.getElementById("inv-tax-rate").value)  || 0;
    const taxableAmt = Math.max(0, subtotal - discount);
    const taxAmount  = taxableAmt * (taxRate / 100);
    const grandTotal = taxableAmt + taxAmount;

    document.getElementById("prev-subtotal").innerText = `${currency}${subtotal.toFixed(2)}`;
    const discountRow = document.getElementById("prev-discount-row");
    if (discount > 0) {
        discountRow.classList.remove("hidden");
        document.getElementById("prev-discount").innerText = `-${currency}${discount.toFixed(2)}`;
    } else { discountRow.classList.add("hidden"); }

    document.getElementById("prev-tax-label").innerText   = `${meta.taxLabel} (${taxRate}%)`;
    document.getElementById("prev-tax").innerText         = `${currency}${taxAmount.toFixed(2)}`;
    document.getElementById("prev-grand-total").innerText = `${currency}${grandTotal.toFixed(2)}`;

    document.getElementById("prev-payment-memo").innerText = document.getElementById("inv-notes").value || "Payment is due upon receipt.";

    generatePaymentQRCode(grandTotal, meta);
}

function generatePaymentQRCode(amount, countryMeta) {
    const pType      = document.getElementById("inv-payment-type").value;
    const qrContainer = document.getElementById("qrcode-canvas");
    if (!qrContainer) return;
    qrContainer.innerHTML = "";

    let qrPayload = "", desc = "";

    if (pType === "upi") {
        const upiId     = document.getElementById("inv-upi-id").value.trim();
        const payeeName = document.getElementById("inv-upi-name").value.trim() || "HorizonGET Merchant";
        if (upiId) {
            qrPayload = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR`;
            desc      = `Instant payment via UPI app to ${upiId}.`;
        } else {
            qrPayload = "Complete settings default values for UPI payments.";
            desc      = "Awaiting payee credentials.";
        }
    } else if (pType === "paypal") {
        const paypalId = document.getElementById("inv-paypal-url").value.trim();
        qrPayload = paypalId ? `https://www.paypal.me/${paypalId}/${amount.toFixed(2)}` : "https://www.paypal.me";
        desc      = paypalId ? `Direct settlement via PayPal to @${paypalId}.` : "Awaiting PayPal account name.";
    } else if (pType === "custom") {
        const url = document.getElementById("inv-custom-url").value.trim();
        qrPayload = url || "https://horizonget.com";
        desc      = url ? "Scan code to open custom checkout portal." : "Default HorizonGET checkout portal link.";
    } else {
        const bankName = document.getElementById("inv-bank-name").value.trim();
        const acc      = document.getElementById("inv-bank-acc").value.trim();
        const swift    = document.getElementById("inv-bank-routing").value.trim();
        if (acc) {
            qrPayload = `Bank: ${bankName}\nAccount/IBAN: ${acc}\nSWIFT/BIC: ${swift}\nAmount: ${countryMeta.symbol}${amount.toFixed(2)}`;
            desc      = `Wire transfer coordinates for account ${acc.substring(0,6)}...`;
        } else {
            qrPayload = "Payment details outstanding.";
            desc      = "Awaiting bank specifications.";
        }
    }

    document.getElementById("prev-qr-payment-desc").innerText = desc;

    try {
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, { text: qrPayload, width: 64, height: 64,
                colorDark: "#111827", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
        } else {
            qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrPayload)}" alt="QR" style="width:64px;height:64px;">`;
        }
    } catch {
        qrContainer.innerHTML = `<span style="font-size:8px;color:#ef4444;text-align:center">Error generating QR</span>`;
    }
}

async function saveActiveInvoice() {
    const user = getActiveUser();
    if (!user) return;

    const clientName = document.getElementById("inv-client-name").value.trim();
    if (!clientName) { showToast("Please specify client name.", "alert-triangle"); return; }

    const invNumber   = document.getElementById("inv-number").value.trim();
    const invDate     = document.getElementById("inv-date").value;
    const dueDate     = document.getElementById("inv-due-date").value;
    const country     = document.getElementById("inv-country").value;
    const discount    = parseFloat(document.getElementById("inv-discount").value) || 0;
    const taxRate     = parseFloat(document.getElementById("inv-tax-rate").value)  || 0;
    const paymentType = document.getElementById("inv-payment-type").value;
    const paymentData = {
        bankName:    document.getElementById("inv-bank-name").value.trim(),
        bankAccount: document.getElementById("inv-bank-acc").value.trim(),
        bankRouting: document.getElementById("inv-bank-routing").value.trim(),
        upiId:       document.getElementById("inv-upi-id").value.trim(),
        upiName:     document.getElementById("inv-upi-name").value.trim(),
        paypalId:    document.getElementById("inv-paypal-url").value.trim(),
        customUrl:   document.getElementById("inv-custom-url").value.trim()
    };
    const notes = document.getElementById("inv-notes").value;

    const items = [];
    let subtotal = 0;
    document.querySelectorAll("#items-list-container .item-row-edit").forEach(row => {
        const desc  = row.querySelector(".item-desc").value  || "Services";
        const qty   = parseFloat(row.querySelector(".item-qty").value)   || 0;
        const price = parseFloat(row.querySelector(".item-price").value) || 0;
        const total = qty * price;
        subtotal   += total;
        items.push({ description: desc, quantity: qty, price, total });
    });

    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount     = taxableAmount * (taxRate / 100);
    const grandTotal    = taxableAmount + taxAmount;

    if (!activeInvoiceId) {
        const duplicate = _invoices.some(i => i.invoiceNumber === invNumber);
        if (duplicate) { showToast(`Invoice number ${invNumber} already exists.`, "alert-triangle"); return; }
    }

    const existingStatus = activeInvoiceId
        ? (_invoices.find(i => i.id === activeInvoiceId)?.status?.toLowerCase() || 'outstanding')
        : 'outstanding';

    const payload = {
        id: activeInvoiceId || 'inv_' + Date.now(),
        invoiceNumber: invNumber, issueDate: invDate, dueDate, country,
        clientName,
        clientEmail:   document.getElementById("inv-client-email").value.trim(),
        clientPhone:   document.getElementById("inv-client-phone").value.trim(),
        clientAddress: document.getElementById("inv-client-address").value.trim(),
        clientTaxId:   document.getElementById("inv-client-tax-reg").value.trim(),
        items, subtotal, discount, taxRate, taxAmount, grandTotal,
        paymentType, paymentData, notes, status: existingStatus
    };

    try {
        await apiCall('/api/invoices', { method: 'POST', body: payload });
        showToast(activeInvoiceId ? "Invoice updated successfully!" : "Invoice created and saved!", "check-circle");

        await saveClientImplicitly({
            name: clientName, email: payload.clientEmail,
            phone: payload.clientPhone, address: payload.clientAddress, taxReg: payload.clientTaxId
        });

        await refreshInvoices();
        initDashboard();
        initHistoryTable();
        switchTab('history');
    } catch (err) {
        showToast(err.message || "Failed to save invoice.", "x-circle");
    }
}

function editInvoice(id) {
    const inv = _invoices.find(i => i.id === id);
    if (!inv) return;

    activeInvoiceId = inv.id;
    document.getElementById("builder-title").innerText = `Edit Invoice ${inv.invoiceNumber}`;
    document.getElementById("save-btn-text").innerText = "Update Invoice";

    document.getElementById("inv-number").value    = inv.invoiceNumber;
    document.getElementById("inv-date").value      = inv.issueDate;
    document.getElementById("inv-due-date").value  = inv.dueDate;
    document.getElementById("inv-country").value   = inv.country;

    document.getElementById("inv-client-name").value    = inv.clientName;
    document.getElementById("inv-client-email").value   = inv.clientEmail   || "";
    document.getElementById("inv-client-phone").value   = inv.clientPhone   || "";
    document.getElementById("inv-client-address").value = inv.clientAddress || "";
    document.getElementById("inv-client-tax-reg").value = inv.clientTaxReg  || "";

    document.getElementById("inv-discount").value     = inv.discount;
    document.getElementById("inv-tax-rate").value     = inv.taxRate;
    document.getElementById("inv-payment-type").value = inv.paymentType;
    document.getElementById("inv-bank-name").value    = inv.bankName    || "";
    document.getElementById("inv-bank-acc").value     = inv.bankAccount || "";
    document.getElementById("inv-bank-routing").value = inv.bankRouting || "";
    document.getElementById("inv-upi-id").value       = inv.upiId       || "";
    document.getElementById("inv-upi-name").value     = inv.upiName     || "";
    document.getElementById("inv-paypal-url").value   = inv.paypalId    || "";
    document.getElementById("inv-custom-url").value   = inv.customUrl   || "";
    document.getElementById("inv-notes").value        = inv.notes       || "";

    document.getElementById("items-list-container").innerHTML = "";
    itemRowCounter = 0;
    (inv.items || []).forEach(item => addInvoiceItemRow(item.description, item.quantity, item.price));

    toggleQRDetails();
    handleInvoiceCountryChange();
    switchTab('create');
}

async function toggleInvoicePaidStatus(id) {
    const inv = _invoices.find(i => i.id === id);
    if (!inv) return;
    const nextStatus = inv.status === "Paid" ? "outstanding" : "paid";
    try {
        await apiCall(`/api/invoices/${id}/status`, { method: 'PUT', body: { status: nextStatus } });
        showToast(`Invoice marked as ${nextStatus === 'paid' ? 'Paid' : 'Outstanding'}`, "check");
        await refreshInvoices();
        initDashboard();
        initHistoryTable();
    } catch (err) {
        showToast(err.message || "Error updating status.", "x-circle");
    }
}

async function deleteInvoice(id) {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    try {
        await apiCall(`/api/invoices/${id}`, { method: 'DELETE' });
        showToast("Invoice deleted.", "trash");
        await refreshInvoices();
        initDashboard();
        initHistoryTable();
    } catch (err) {
        showToast(err.message || "Error deleting invoice.", "x-circle");
    }
}

function formatDateString(str) {
    if (!str) return "N/A";
    const date = new Date(str);
    if (isNaN(date.getTime())) return str;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function saveClientImplicitly(clientMeta) {
    if (!clientMeta.name) return;
    const exists = _clients.some(c => c.name.toLowerCase() === clientMeta.name.toLowerCase());
    if (!exists) {
        try {
            const id = 'cli_' + Date.now();
            await apiCall('/api/clients', {
                method: 'POST',
                body: { id, name: clientMeta.name, email: clientMeta.email || '',
                        phone: clientMeta.phone || '', address: clientMeta.address || '',
                        taxReg: clientMeta.taxReg || '' }
            });
            await refreshClients();
            loadClientDirectory();
        } catch {}
    }
}
