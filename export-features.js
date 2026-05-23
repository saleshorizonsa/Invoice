/* ==========================================================================
   HORIZONGET INVOICE EXPORT FEATURES
   Local Storage Management: PDF, JSON, CSV Export
   ========================================================================== */

// =================== PDF EXPORT (using browser's print feature) ===================

/**
 * Trigger PDF export for current invoice
 * Uses browser's print-to-PDF functionality with CSS optimized layout
 */
function exportInvoicePDF(invoiceId = null) {
    const invoice = invoiceId ? getInvoiceById(invoiceId) : getCurrentInvoice();
    
    if (!invoice) {
        showToast("No invoice to export. Create one first!", "alert-triangle");
        return;
    }
    
    // Auto-populate the preview with current invoice data
    updateInvoicePreview(invoice);
    
    // Trigger browser print dialog
    setTimeout(() => {
        window.print();
        showToast(`Print dialog opened for ${invoice.invoiceNumber}`, "printer");
    }, 100);
}

/**
 * Retrieves invoice object by ID from in-memory cache
 */
function getInvoiceById(invoiceId) {
    return _invoices.find(inv => inv.id === invoiceId) || null;
}

/**
 * Get current invoice being edited from form
 */
function getCurrentInvoice() {
    const user = getActiveUser();
    if (!user) return null;
    
    const invoice = {
        id: activeInvoiceId || generateInvoiceId(),
        userEmail: user.email,
        invoiceNumber: document.getElementById("inv-number").value,
        issueDate: formatDate(document.getElementById("inv-date").value),
        dueDate: formatDate(document.getElementById("inv-due-date").value),
        country: document.getElementById("inv-country").value,
        
        senderName: user.companyName,
        senderAddress: user.address,
        senderEmail: user.email,
        senderPhone: user.phone,
        senderTaxId: user.taxId,
        
        clientName: document.getElementById("inv-client-name").value,
        clientEmail: document.getElementById("inv-client-email").value,
        clientPhone: document.getElementById("inv-client-phone").value,
        clientAddress: document.getElementById("inv-client-address").value,
        clientTaxId: document.getElementById("inv-client-tax-reg").value,
        
        items: getInvoiceItems(),
        
        subtotal: calculateSubtotal(),
        discount: parseFloat(document.getElementById("inv-discount").value) || 0,
        taxRate: parseFloat(document.getElementById("inv-tax-rate").value) || 0,
        taxAmount: calculateTax(),
        grandTotal: calculateGrandTotal(),
        
        paymentType: document.getElementById("inv-payment-type").value,
        bankName: document.getElementById("inv-bank-name").value,
        bankAccount: document.getElementById("inv-bank-acc").value,
        bankRouting: document.getElementById("inv-bank-routing").value,
        upiId: document.getElementById("inv-upi-id").value,
        paymentMemo: document.getElementById("inv-payment-memo").value,
        
        status: "draft",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    return invoice;
}

// =================== JSON EXPORT (Full Invoice Data) ===================

/**
 * Export single invoice as JSON file
 */
function exportInvoiceJSON(invoiceId) {
    const invoice = getInvoiceById(invoiceId);
    
    if (!invoice) {
        showToast("Invoice not found!", "alert-triangle");
        return;
    }
    
    const jsonData = JSON.stringify(invoice, null, 2);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.invoiceNumber}_invoice.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${invoice.invoiceNumber} as JSON`, "download");
}

/**
 * Export ALL invoices for current user as JSON
 */
function exportAllInvoicesJSON() {
    const user = getActiveUser();
    if (!user) return;

    if (_invoices.length === 0) {
        showToast("No invoices to export!", "alert-triangle");
        return;
    }

    const exportData = {
        exportedAt:    new Date().toISOString(),
        userEmail:     user.email,
        companyName:   user.companyName,
        totalInvoices: _invoices.length,
        invoices:      _invoices
    };

    const jsonData = JSON.stringify(exportData, null, 2);
    const blob     = new Blob([jsonData], { type: "application/json" });
    const url      = URL.createObjectURL(blob);
    const link     = document.createElement("a");
    link.href      = url;
    link.download  = `${user.companyName.replace(/\s+/g, '_')}_invoices_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${_invoices.length} invoices as JSON`, "download");
}

// =================== CSV EXPORT (for Accounting/Excel Import) ===================

/**
 * Export invoices as CSV for Excel/Google Sheets import
 */
function exportInvoicesCSV() {
    const user = getActiveUser();
    if (!user) return;

    const userInvoices = _invoices;
    if (userInvoices.length === 0) {
        showToast("No invoices to export!", "alert-triangle");
        return;
    }
    
    // CSV Header
    const headers = [
        "Invoice Number",
        "Date Issued",
        "Due Date",
        "Client Name",
        "Client Email",
        "Country",
        "Subtotal",
        "Discount",
        "Tax Rate (%)",
        "Tax Amount",
        "Grand Total",
        "Status",
        "Payment Type"
    ];
    
    // Convert invoices to CSV rows
    const rows = userInvoices.map(inv => [
        inv.invoiceNumber,
        inv.issueDate,
        inv.dueDate,
        inv.clientName,
        inv.clientEmail,
        inv.country,
        inv.subtotal.toFixed(2),
        inv.discount.toFixed(2),
        inv.taxRate.toFixed(2),
        inv.taxAmount.toFixed(2),
        inv.grandTotal.toFixed(2),
        inv.status || "draft",
        inv.paymentType || "bank"
    ]);
    
    // Build CSV content
    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => {
            // Escape quotes and wrap in quotes if contains comma
            if (typeof cell === 'string' && (cell.includes(",") || cell.includes('"'))) {
                return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
        }).join(","))
    ].join("\n");
    
    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `${user.companyName.replace(/\s+/g, '_')}_invoices_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${userInvoices.length} invoices as CSV`, "download");
}

/**
 * Export detailed invoice line items as CSV
 */
function exportInvoiceLineItemsCSV(invoiceId) {
    const invoice = getInvoiceById(invoiceId);
    
    if (!invoice || !invoice.items || invoice.items.length === 0) {
        showToast("No items found in this invoice!", "alert-triangle");
        return;
    }
    
    // CSV Header
    const headers = [
        "Invoice Number",
        "Item Description",
        "Quantity",
        "Unit Price",
        "Total Amount"
    ];
    
    // Convert items to CSV rows
    const rows = invoice.items.map(item => [
        invoice.invoiceNumber,
        item.description,
        item.quantity,
        parseFloat(item.price).toFixed(2),
        parseFloat(item.total).toFixed(2)
    ]);
    
    // Build CSV content
    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => {
            if (typeof cell === 'string' && (cell.includes(",") || cell.includes('"'))) {
                return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
        }).join(","))
    ].join("\n");
    
    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.invoiceNumber}_line_items.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${invoice.items.length} items from ${invoice.invoiceNumber}`, "download");
}

// =================== LOCAL DATA BACKUP & RESTORE ===================

/**
 * Export invoice + client data backup as JSON
 */
function exportLocalDataBackup() {
    const user = getActiveUser();
    const backupData = {
        exportedAt: new Date().toISOString(),
        appVersion: "2.0.0",
        user:       { name: user?.name, companyName: user?.companyName, email: user?.email },
        invoices:   _invoices,
        clients:    _clients,
        theme:      localStorage.getItem("horizon_theme") || "dark"
    };

    const jsonData = JSON.stringify(backupData, null, 2);
    const blob     = new Blob([jsonData], { type: "application/json" });
    const url      = URL.createObjectURL(blob);
    const link     = document.createElement("a");
    link.href      = url;
    link.download  = `horizonget_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Backup exported successfully!", "download");
}

/**
 * Not supported in cloud mode
 */
function importLocalDataBackup() {
    showToast("Data import is not available in cloud mode. Use the API.", "info");
}

/**
 * Sign out (data is safe in the cloud)
 */
function wipeAllLocalData() {
    if (!confirm("This will sign you out. Your data remains securely stored in the cloud.")) return;
    handleLogout();
}

// =================== ACTION BUTTONS FOR HISTORY TABLE ===================

/**
 * Render action buttons for invoice row in history table
 */
function getInvoiceActionButtons(invoice) {
    return `
        <div class="action-buttons-group">
            <button class="btn btn-sm btn-outline" title="Download PDF" onclick="exportInvoicePDF('${invoice.id}')">
                <i data-lucide="file-pdf"></i>
            </button>
            <button class="btn btn-sm btn-outline" title="Download JSON" onclick="exportInvoiceJSON('${invoice.id}')">
                <i data-lucide="download"></i>
            </button>
            <button class="btn btn-sm btn-outline" title="Line Items CSV" onclick="exportInvoiceLineItemsCSV('${invoice.id}')">
                <i data-lucide="file-spreadsheet"></i>
            </button>
            <button class="btn btn-sm btn-primary" title="Share" onclick="openShareModal(${JSON.stringify(invoice).replace(/'/g, "&apos;")})">
                <i data-lucide="share-2"></i>
            </button>
        </div>
    `;
}

// =================== HELPER FUNCTIONS ===================

/**
 * Generate unique invoice ID
 */
function generateInvoiceId() {
    return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format date to readable format
 */
function formatDate(dateString) {
    if (!dateString) return new Date().toLocaleDateString();
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

/**
 * Get invoice items from form
 */
function getInvoiceItems() {
    const items = [];
    const rows = document.querySelectorAll(".item-row-edit");
    
    rows.forEach(row => {
        const desc = row.querySelector(".item-desc").value;
        const qty = parseFloat(row.querySelector(".item-qty").value) || 0;
        const price = parseFloat(row.querySelector(".item-price").value) || 0;
        
        if (desc && qty > 0 && price > 0) {
            items.push({
                description: desc,
                quantity: qty,
                price: price,
                total: qty * price
            });
        }
    });
    
    return items;
}

/**
 * Calculate invoice subtotal
 */
function calculateSubtotal() {
    const items = getInvoiceItems();
    return items.reduce((sum, item) => sum + item.total, 0);
}

/**
 * Calculate tax amount
 */
function calculateTax() {
    const subtotal = calculateSubtotal();
    const discount = parseFloat(document.getElementById("inv-discount").value) || 0;
    const taxRate = parseFloat(document.getElementById("inv-tax-rate").value) || 0;
    const taxableAmount = subtotal - discount;
    return (taxableAmount * taxRate) / 100;
}

/**
 * Calculate grand total
 */
function calculateGrandTotal() {
    return calculateSubtotal() - (parseFloat(document.getElementById("inv-discount").value) || 0) + calculateTax();
}

// =================== MONETIZATION: DOWNLOAD LIMITS ===================

/**
 * Check if user has exceeded free download limits
 * Returns: { canDownload: boolean, message: string }
 */
function checkDownloadLimit(type = "pdf") {
    const user = getActiveUser();
    if (!user) return { canDownload: false, message: "User not logged in" };
    
    const today = new Date().toISOString().split('T')[0];
    const limitKey = `download_limit_${user.email}_${today}_${type}`;
    const currentCount = parseInt(localStorage.getItem(limitKey) || "0");
    const FREE_LIMIT = 3; // Free users can download 3 PDFs per day
    
    if (currentCount >= FREE_LIMIT) {
        return { 
            canDownload: false, 
            message: `Daily ${type.toUpperCase()} export limit (${FREE_LIMIT}) reached. Upgrade to Pro for unlimited exports.` 
        };
    }
    
    return { canDownload: true, message: "" };
}

/**
 * Record download usage
 */
function recordDownloadUsage(type = "pdf") {
    const user = getActiveUser();
    if (!user) return;
    
    const today = new Date().toISOString().split('T')[0];
    const limitKey = `download_limit_${user.email}_${today}_${type}`;
    const currentCount = parseInt(localStorage.getItem(limitKey) || "0");
    
    localStorage.setItem(limitKey, currentCount + 1);
}

/**
 * Show upgrade prompt for premium features
 */
function showUpgradePrompt(feature) {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
        <div class="modal-content glass" style="max-width: 500px;">
            <div class="modal-header">
                <h3>🚀 Upgrade to Pro</h3>
                <button class="btn-close" onclick="this.closest('.modal-overlay').remove()"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body">
                <p>The <strong>${feature}</strong> feature is available in Pro+ plans.</p>
                <div class="pricing-card mt-4" style="padding: 1.5rem; background: var(--color-surface); border-radius: 0.5rem;">
                    <h4>Pro Plan - $4.99/month</h4>
                    <ul style="margin: 1rem 0; list-style: none; padding: 0;">
                        <li>✓ Unlimited PDF exports</li>
                        <li>✓ Cloud backup</li>
                        <li>✓ Recurring invoices</li>
                        <li>✓ Priority support</li>
                    </ul>
                </div>
                <button class="btn btn-primary btn-block mt-4" onclick="startSubscription('pro')">
                    Start Free Trial
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.querySelector(".btn-close").click(); // For demo, auto-close
}
