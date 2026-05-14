
document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connect-btn');
    const sseUrlInput = document.getElementById('sse-url');
    const statusIndicator = document.getElementById('connection-status');
    const statusText = statusIndicator.querySelector('.status-text');

    connectBtn.addEventListener('click', async () => {
        const url = sseUrlInput.value.trim();
        if (!url) return;

        connectBtn.disabled = true;
        connectBtn.innerHTML = '<span class="loading-spinner"></span> <span>Saving...</span>';
        statusIndicator.className = 'status-indicator';
        statusText.textContent = 'Saving...';

        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sse_url: url })
            });

            if (response.ok) {
                statusIndicator.className = 'status-indicator connected';
                statusText.textContent = 'URL saved successfully';

                const toast = document.createElement('div');
                toast.style.cssText = 'position:fixed; top:20px; right:20px; background:#10b981; color:white; padding:14px 22px; border-radius:12px; z-index:1000; font-weight:500; box-shadow:0 10px 30px rgba(0,0,0,0.3);';
                toast.textContent = '✓ SSE URL saved. Head to Tools to sync.';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (e) {
            statusIndicator.className = 'status-indicator error';
            statusText.textContent = e.message || 'Error saving settings';
        } finally {
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<i data-lucide="save"></i> <span>Save</span>';
            lucide.createIcons();
        }
    });
});
