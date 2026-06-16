'use strict';

/* ═══════════════════════════════════════════════════════════════════
   SCHOLARLY COMPASS — AUTH SCRIPT
   - Registration (registrations table)
   - Login (user_login RPC)
   - Role-based dashboard redirect
   - Session localStorage me (refresh-safe)
═══════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://uxhltsmddtuiqoadhdfd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aGx0c21kZHR1aXFvYWRoZGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjc2NDIsImV4cCI6MjA5NTAwMzY0Mn0.oKwtLMYhOpj_z4W-G9aEe1kmp9_q6sLDl273dQLBfbw';

const IS_LIVE = SUPABASE_URL && SUPABASE_URL.startsWith('https://');
const sb = IS_LIVE ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/* role -> dashboard file */
function dashboardFor(role) {
    if (role === 'admin' || role === 'co_admin') return 'admin-dashboard.html';
    if (role === 'writer') return 'writer-dashboard.html';
    return 'student-dashboard.html';
}

/* ─── NAVBAR SCROLL ─── */
const siteNav = document.getElementById('siteNav');
window.addEventListener('scroll', () => {
    if (!siteNav) return;
    if (window.scrollY > 30) siteNav.classList.add('scrolled');
    else siteNav.classList.remove('scrolled');
});

/* ─── HAMBURGER ─── */
const hamburger = document.getElementById('hamburger');
const mobilePanel = document.getElementById('mobilePanel');
if (hamburger && mobilePanel) {
    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        hamburger.classList.toggle('open');
        mobilePanel.classList.toggle('open');
    });
    mobilePanel.querySelectorAll('a, button').forEach(a => {
        a.addEventListener('click', () => {
            hamburger.classList.remove('open');
            mobilePanel.classList.remove('open');
        });
    });
    document.addEventListener('click', (e) => {
        if (siteNav && !siteNav.contains(e.target)) {
            hamburger.classList.remove('open');
            mobilePanel.classList.remove('open');
        }
    });
}

/* ─── SMOOTH SCROLL ─── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (id.length > 1 && document.querySelector(id)) {
            e.preventDefault();
            document.querySelector(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

/* ─── MODALS ─── */
function openRegister() { closeAllModals(); document.getElementById('registerModal').classList.add('show'); document.body.style.overflow = 'hidden'; }
function openLogin() { closeAllModals(); document.getElementById('loginModal').classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('show'); document.body.style.overflow = ''; }
function closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show')); document.body.style.overflow = ''; }
function switchModal(fromId, toId) {
    closeModal(fromId);
    setTimeout(() => { document.getElementById(toId).classList.add('show'); document.body.style.overflow = 'hidden'; }, 100);
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAllModals(); });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });

/* ─── TOAST ─── */
let _toastTimer;
function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

/* ─── ALERTS ─── */
function showAlert(modalPrefix, message, type = 'error') {
    const el = document.getElementById(modalPrefix + 'Alert');
    el.textContent = message;
    el.className = 'alert-box ' + type;
    el.style.display = 'block';
}
function hideAlert(modalPrefix) { document.getElementById(modalPrefix + 'Alert').style.display = 'none'; }

/* ═══════════════════════════════════════════════════════════════════
   REGISTRATION
═══════════════════════════════════════════════════════════════════ */
async function submitRegistration() {
    hideAlert('reg');
    const name  = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const phone = document.getElementById('regPhone').value.trim();

    if (!name || !email || !phone) { showAlert('reg', '⚠ Fill in all the fields.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAlert('reg', '⚠ Enter a valid email address.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { showAlert('reg', '⚠ Enter valid phone number (at least 10 digits).'); return; }
    if (!IS_LIVE) { showAlert('reg', '⚠ Set the Supabase URL and key in Auth.js.'); return; }

    const btn = document.getElementById('regSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Submitting…';
    try {
        const { data, error } = await sb.from('registrations').insert({
            full_name: name, email: email, phone: phone,
            status: 'pending', payment_status: 'unpaid', role: 'student'
        }).select().single();

        if (error) {
            if (error.code === '23505') showAlert('reg', '⚠ This email is already registered. Try logging in.');
            else showAlert('reg', '⚠ Error: ' + error.message);
            return;
        }
        showAlert('reg', '✓ Registration successful! You will receive your username and password via email within 24 hours.', 'success');
        document.getElementById('regName').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regPhone').value = '';
        setTimeout(() => { closeModal('registerModal'); toast('✓ Registered successfully! Check your email.', 'success'); }, 4000);
    } catch (e) {
        showAlert('reg', '⚠ Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Submit Registration →';
    }
}

/* ═══════════════════════════════════════════════════════════════════
   LOGIN
═══════════════════════════════════════════════════════════════════ */
async function submitLogin() {
    hideAlert('login');
    const username = document.getElementById('logUser').value.trim().toUpperCase();
    const password = document.getElementById('logPass').value;

    if (!username || !password) { showAlert('login', '⚠ Enter both the username and password.'); return; }
    if (!IS_LIVE) { showAlert('login', '⚠ Set the Supabase URL and key in Auth.js.'); return; }

    const btn = document.getElementById('logSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Signing in…';
    try {
        const { data, error } = await sb.rpc('user_login', { p_username: username, p_password: password });
        if (error) { showAlert('login', '⚠ Error: ' + error.message); return; }
        if (!data || !data.success) { showAlert('login', '' + (data?.incorrect  || 'Incorrect credentials.')); return; }

        const user = {
            id: data.id, full_name: data.full_name, email: data.email,
            username: data.username, role: data.role
        };

        /* localStorage → refresh / tab band hone par bhi login bana rahega */
        localStorage.setItem('sc_user', JSON.stringify(user));
        sessionStorage.setItem('sc_user', JSON.stringify(user)); // backward-compat

        toast('✓ Welcome, ' + data.full_name.split(' ')[0] + '!', 'success');
        setTimeout(() => { window.location.href = dashboardFor(data.role); }, 800);

    } catch (e) {
        showAlert('login', '⚠ Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Sign In →';
    }
}

/* ─── ALREADY LOGGED IN? (optional auto-redirect off by default) ─── */
(function checkExistingSession() {
    // Agar chaho ki logged-in user landing page kholte hi seedha dashboard pe jaye,
    // to neeche ki lines uncomment karo:
    // try {
    //     const u = JSON.parse(localStorage.getItem('sc_user'));
    //     if (u && u.role) window.location.href = dashboardFor(u.role);
    // } catch (e) {}
})();