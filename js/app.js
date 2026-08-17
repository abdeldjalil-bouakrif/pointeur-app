// In setupPullToRefresh():
window.addEventListener('touchstart', (e) => {
    if (document.body.classList.contains('modal-open')) return;
    if (window.scrollY <= 2) {
        touchStartY = e.touches[0].clientY;
        isPulling = true;
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (!isPulling || document.body.classList.contains('modal-open')) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;
    // ...
});

// In openModal():
function openModal() {
    // ... reset fields ...
    document.getElementById('modalOverlay').classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
}

// In closeModal():
function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    isSaving = false;
}
