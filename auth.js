'use strict';

/* ═══════════════════════════════════════════════════════════════════
   PEAK POTENTIA — AUTH SCRIPT
   - Registration (registrations table)
   - Login (user_login RPC)
   - Role-based dashboard redirect
   - Session: localStorage + sessionStorage
═══════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://uxhltsmddtuiqoadhdfd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aGx0c21kZHR1aXFvYWRoZGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjc2NDIsImV4cCI6MjA5NTAwMzY0Mn0.oKwtLMYhOpj_z4W-G9aEe1kmp9_q6sLDl273dQLBfbw';

const IS_LIVE = SUPABASE_URL && SUPABASE_URL.startsWith('https://');
const sb = IS_LIVE ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/* role -> dashboard file */
function dashboardFor(role) {
    if (role === 'admin' || role === 'co_admin') return 'admin-dashboard.html';
    if (role === 'writer' || role === 'teacher') return 'writer-dashboard.html';
    return 'student-dashboard.html';
}

/* ═══════════════════════════════════════════════════════════════════
   LOGIN  (uses inline form — showLoginAlert defined in index.html)
═══════════════════════════════════════════════════════════════════ */
async function submitLogin() {
    hideLoginAlert();
    const username = document.getElementById('logUser').value.trim().toUpperCase();
    const password = document.getElementById('logPass').value;

    if (!username || !password) { showLoginAlert('Enter both the username and password.', 'error'); return; }
    if (!IS_LIVE) { showLoginAlert('Supabase URL or key missing in auth.js.', 'error'); return; }

    const btn = document.getElementById('logSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="sp"></span> Signing in\u2026';

    try {
        const { data, error } = await sb.rpc('user_login', { p_username: username, p_password: password });
        if (error) { showLoginAlert('Error: ' + error.message, 'error'); return; }
        if (!data || !data.success) { showLoginAlert(data && data.message ? data.message : 'Incorrect credentials.', 'error'); return; }

        const user = {
            id: data.id,
            full_name: data.full_name,
            email: data.email,
            username: data.username,
            role: data.role
        };

        localStorage.setItem('sc_user', JSON.stringify(user));
        sessionStorage.setItem('sc_user', JSON.stringify(user));

        showLoginAlert('Welcome, ' + data.full_name.split(' ')[0] + '! Redirecting\u2026', 'success');
        setTimeout(function() { window.location.href = dashboardFor(data.role); }, 900);

    } catch (e) {
        showLoginAlert('Error: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Sign in to portal \u2192';
    }
}

/* ═══════════════════════════════════════════════════════════════════
   REGISTRATION  (uses modal alert — showAlert defined in index.html)
═══════════════════════════════════════════════════════════════════ */
async function submitRegistration() {
    hideAlert('reg');
    const name  = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const phone = document.getElementById('regPhone').value.trim();

    if (!name || !email || !phone) { showAlert('reg', 'Fill in all the fields.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAlert('reg', 'Enter a valid email address.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { showAlert('reg', 'Enter a valid phone number (at least 10 digits).'); return; }
    if (!IS_LIVE) { showAlert('reg', 'Supabase URL or key missing in auth.js.'); return; }

    const btn = document.getElementById('regSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Submitting\u2026';

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
            if (error.code === '23505') showAlert('reg', 'This email is already registered. Try logging in.');
            else showAlert('reg', 'Error: ' + error.message);
            return;
        }

        showAlert('reg', 'Registration successful! You will receive your username and password via email within 24 hours.', 'success');
        document.getElementById('regName').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regPhone').value = '';
        setTimeout(function() {
            closeModal('registerModal');
            toast('Registered successfully! Check your email.', 'success');
        }, 4000);

    } catch (e) {
        showAlert('reg', 'Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Submit Registration \u2192';
    }
}

/* ─── ALREADY LOGGED IN? (auto-redirect off by default) ─── */
(function checkExistingSession() {
    // Uncomment to auto-redirect logged-in users straight to their dashboard:
    // try {
    //     var u = JSON.parse(localStorage.getItem('sc_user'));
    //     if (u && u.role) window.location.href = dashboardFor(u.role);
    // } catch (e) {}
})();