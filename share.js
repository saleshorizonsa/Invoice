/* ==========================================================================
   HORIZONGET DIGITAL SHARING AND CLIPBOARD PORTAL
   ========================================================================== */

let activeSharingInvoice = null;

// Opens the sharing modal overlay
function openShareModal(invoice) {
    activeSharingInvoice = invoice;
    
    document.getElementById("share-inv-number").innerText = invoice.invoiceNumber;
    
    // Create text layout summary
    const summaryText = buildInvoiceTextSummary(invoice);
    document.getElementById("share-summary-text").value = summaryText;
    
    // Reset copy button
    const copyLabel = document.getElementById("copy-btn-label");
    const copyIcon = document.getElementById("copy-icon");
    copyLabel.innerText = "Copy";
    copyIcon.setAttribute("data-lucide", "copy");
    lucide.createIcons();
    
    // Show modal
    document.getElementById("share-modal").classList.remove("hidden");
}

// Closes sharing modal
function closeShareModal(event) {
    if (!event || event.target === document.getElementById("share-modal")) {
        document.getElementById("share-modal").classList.add("hidden");
    }
}

// Builds neat textual layout representing invoice calculations
function buildInvoiceTextSummary(invoice) {
    const meta = getCountryMeta(invoice.country || "US");
    const currency = meta.symbol;
    
    let summary = `📄 HorizonGET INVOICE SUMMARY\n`;
    summary += `--------------------------------------\n`;
    summary += `Invoice Number: ${invoice.invoiceNumber}\n`;
    summary += `Issue Date: ${invoice.issueDate}\n`;
    summary += `Due Date: ${invoice.dueDate}\n`;
    summary += `\n`;
    summary += `FROM: ${invoice.senderName}\n`;
    summary += `TO: ${invoice.clientName}\n`;
    summary += `--------------------------------------\n`;
    summary += `ITEMS:\n`;
    
    invoice.items.forEach((item, index) => {
        summary += `${index + 1}. ${item.description} (Qty: ${item.quantity} x ${currency}${parseFloat(item.price).toFixed(2)}) = ${currency}${parseFloat(item.total).toFixed(2)}\n`;
    });
    
    summary += `--------------------------------------\n`;
    summary += `Subtotal: ${currency}${parseFloat(invoice.subtotal).toFixed(2)}\n`;
    if (parseFloat(invoice.discount) > 0) {
        summary += `Discount: -${currency}${parseFloat(invoice.discount).toFixed(2)}\n`;
    }
    summary += `${meta.taxLabel} (${invoice.taxRate}%): ${currency}${parseFloat(invoice.taxAmount).toFixed(2)}\n`;
    summary += `GRAND TOTAL DUE: ${currency}${parseFloat(invoice.grandTotal).toFixed(2)}\n`;
    summary += `--------------------------------------\n`;
    
    if (invoice.paymentType === "upi" && invoice.upiId) {
        summary += `UPI Payee ID: ${invoice.upiId}\n`;
    } else if (invoice.paymentType === "bank" && invoice.bankAccount) {
        summary += `Bank: ${invoice.bankName} | Account: ${invoice.bankAccount}\n`;
    }
    summary += `\nThank you for your business!\n`;
    
    return summary;
}

// Prepares a mailto scheme to open native client
function triggerEmailShare() {
    if (!activeSharingInvoice) return;
    
    const clientEmail = activeSharingInvoice.clientEmail || "";
    const subject = encodeURIComponent(`Invoice ${activeSharingInvoice.invoiceNumber} from ${activeSharingInvoice.senderName}`);
    const body = encodeURIComponent(buildInvoiceTextSummary(activeSharingInvoice));
    
    window.open(`mailto:${clientEmail}?subject=${subject}&body=${body}`);
}

// Opens whatsapp link builder
function triggerWhatsAppShare() {
    if (!activeSharingInvoice) return;
    
    const clientPhone = activeSharingInvoice.clientPhone ? activeSharingInvoice.clientPhone.replace(/[^0-9+]/g, '') : "";
    const text = encodeURIComponent(buildInvoiceTextSummary(activeSharingInvoice));
    
    // Web or mobile WhatsApp link
    const waUrl = `https://api.whatsapp.com/send?phone=${clientPhone}&text=${text}`;
    window.open(waUrl, "_blank");
}

// Copy sharing block text to clipboard
function copyShareText() {
    const textEl = document.getElementById("share-summary-text");
    textEl.select();
    textEl.setSelectionRange(0, 99999); // Mobile
    
    navigator.clipboard.writeText(textEl.value)
        .then(() => {
            const copyLabel = document.getElementById("copy-btn-label");
            const copyIcon = document.getElementById("copy-icon");
            
            copyLabel.innerText = "Copied!";
            copyIcon.setAttribute("data-lucide", "check");
            lucide.createIcons();
            
            showToast("Copied invoice details to clipboard!", "check");
        })
        .catch(err => {
            showToast("Failed to copy text automatically.", "x-circle");
        });
}
