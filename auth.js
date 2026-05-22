'use strict';

/* ═══════════════════════════════════════════════════════════════════
   SCHOLARLY COMPASS — AUTH SCRIPT
   ───────────────────────────────────────────────────────────────────
   Yeh file handle karti hai:
     1. Registration (Name, Email, Phone → registrations table)
     2. Login (Username + Password → user_login RPC)
     3. Modal switching
═══════════════════════════════════════════════════════════════════ */


/* ─── SUPABASE CONFIG ─── */
/* IMPORTANT: Yahan apna Supabase URL aur ANON KEY paste karo */
const SUPABASE_URL = 'https://uxhltsmddtuiqoadhdfd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aGx0c21kZHR1aXFvYWRoZGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjc2NDIsImV4cCI6MjA5NTAwMzY0Mn0.oKwtLMYhOpj_z4W-G9aEe1kmp9_q6sLDl273dQLBfbw';

const IS_LIVE = SUPABASE_URL && SUPABASE_URL.startsWith('https://');
const sb = IS_LIVE ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;


/* ─── NAVBAR SCROLL EFFECT ─── */
const siteNav = document.getElementById('siteNav');
window.addEventListener('scroll', () => {
    if (window.scrollY > 30) siteNav.classList.add('scrolled');
    else siteNav.classList.remove('scrolled');
});


/* ─── HAMBURGER MENU (mobile) ─── */
const hamburger = document.getElementById('hamburger');
const mobilePanel = document.getElementById('mobilePanel');
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
    if (!siteNav.contains(e.target)) {
        hamburger.classList.remove('open');
        mobilePanel.classList.remove('open');
    }
});


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


/* ─── MODAL CONTROLS ─── */
function openRegister() {
    closeAllModals();
    document.getElementById('registerModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function openLogin() {
    closeAllModals();
    document.getElementById('loginModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
    document.body.style.overflow = '';
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
    document.body.style.overflow = '';
}

function switchModal(fromId, toId) {
    closeModal(fromId);
    setTimeout(() => {
        document.getElementById(toId).classList.add('show');
        document.body.style.overflow = 'hidden';
    }, 100);
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAllModals();
    });
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
});


/* ─── TOAST NOTIFICATION ─── */
let _toastTimer;
function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}


/* ─── ALERT BOX HELPERS ─── */
function showAlert(modalPrefix, message, type = 'error') {
    const el = document.getElementById(modalPrefix + 'Alert');
    el.textContent = message;
    el.className = 'alert-box ' + type;
    el.style.display = 'block';
}
function hideAlert(modalPrefix) {
    document.getElementById(modalPrefix + 'Alert').style.display = 'none';
}


/* ═══════════════════════════════════════════════════════════════════
   REGISTRATION
   ═══════════════════════════════════════════════════════════════════ */
async function submitRegistration() {
    hideAlert('reg');

    const name  = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const phone = document.getElementById('regPhone').value.trim();

    // ─── Validation ───
    if (!name || !email || !phone) {
        showAlert('reg', '⚠ Saare fields fill karo.');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('reg', '⚠ Valid email address daalo.');
        return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
        showAlert('reg', '⚠ Valid phone number daalo (atleast 10 digits).');
        return;
    }

    if (!IS_LIVE) {
        showAlert('reg', '⚠ Supabase URL aur KEY auth.js mein set karo.');
        return;
    }

    // ─── Submit ───
    const btn = document.getElementById('regSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Submitting…';

    try {
        const { data, error } = await sb.from('registrations').insert({
            full_name: name,
            email: email,
            phone: phone,
            status: 'pending',
            payment_status: 'unpaid',
            role: 'student'
        }).select().single();

        if (error) {
            if (error.code === '23505') {
                showAlert('reg', '⚠ Yeh email pehle se registered hai. Login try karo.');
            } else {
                showAlert('reg', '⚠ Error: ' + error.message);
            }
            return;
        }

        // ─── Success ───
        showAlert('reg',
            '✓ Registration successful! Aapko 24 hours ke andar email par username aur password mil jayega.',
            'success'
        );

        // Clear form
        document.getElementById('regName').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regPhone').value = '';

        // Close after 4 seconds
        setTimeout(() => {
            closeModal('registerModal');
            toast('✓ Registered successfully! Check your email.', 'success');
        }, 4000);

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

    if (!username || !password) {
        showAlert('login', '⚠ Username aur password dono daalo.');
        return;
    }

    if (!IS_LIVE) {
        showAlert('login', '⚠ Supabase URL aur KEY auth.js mein set karo.');
        return;
    }

    const btn = document.getElementById('logSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Signing in…';

    try {
        const { data, error } = await sb.rpc('user_login', {
            p_username: username,
            p_password: password
        });

        if (error) {
            showAlert('login', '⚠ Error: ' + error.message);
            return;
        }

        if (!data || !data.success) {
            showAlert('login', '⚠ ' + (data?.message || 'Galat credentials.'));
            return;
        }

        // ─── Login successful! ───
        const user = {
            id: data.id,
            full_name: data.full_name,
            email: data.email,
            username: data.username,
            role: data.role
        };

        sessionStorage.setItem('sc_user', JSON.stringify(user));
        toast('✓ Welcome, ' + data.full_name.split(' ')[0] + '!', 'success');

        // Redirect based on role
        setTimeout(() => {
            if (data.role === 'judge') {
                window.location.href = 'judge-dashboard.html';
            } else if (data.role === 'admin') {
                window.location.href = 'judge-dashboard.html'; // admin uses judge UI for now
            } else {
                window.location.href = 'student-dashboard.html';
            }
        }, 800);

    } catch (e) {
        showAlert('login', '⚠ Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Sign In →';
    }
}


/* ═══════════════════════════════════════════════════════════════════
   AUTO-REDIRECT IF ALREADY LOGGED IN
   ═══════════════════════════════════════════════════════════════════ */
(function checkExistingSession() {
    const saved = sessionStorage.getItem('sc_user');
    if (saved) {
        // Optional: Auto-redirect ko comment karo agar user landing page dekhna chahe
        // try {
        //     const u = JSON.parse(saved);
        //     if (u.role === 'judge') window.location.href = 'judge-dashboard.html';
        //     else window.location.href = 'student-dashboard.html';
        // } catch {}
    }
})();