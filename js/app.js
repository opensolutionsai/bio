const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
    user: null,
    profile: null,
    links: [],
    theme: 'default'
};

const router = {
    routes: {
        '/': 'landing-view',
        '/login': 'auth-view',
        '/signup': 'auth-view',
        '/onboarding': 'onboarding-view',
        '/dashboard': 'dashboard-view'
    },
    navigate(path) {
        // Simple hash routing fallback or history API
        window.history.pushState({}, '', path);
        this.resolve();
    },
    resolve() {
        const path = window.location.pathname;

        // Known internal routes
        const knownRoutes = ['/', '/login', '/signup', '/onboarding', '/dashboard'];

        // Check if path is a username
        if (!knownRoutes.includes(path) && path.length > 1) {
            const username = path.substring(1);
            if (/^[a-zA-Z0-9_-]+$/.test(username)) {
                renderPublicProfile(username);
                return;
            }
        }

        // Auth Guard
        if (state.user && (path === '/login' || path === '/signup' || path === '/')) {
            this.navigate('/dashboard');
            return;
        }
        if (!state.user && path === '/dashboard') {
            this.navigate('/login');
            return;
        }

        const viewId = this.routes[path] || 'landing-view';

        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        document.getElementById(viewId)?.classList.remove('hidden');

        // Toggle Nav based on view
        const nav = document.getElementById('navbar');
        if (viewId === 'dashboard-view') {
            // init dashboard
            loadDashboard();
        } else if (viewId === 'auth-view') {
            // check if signup or login to adjust text
            const isSignup = path === '/signup';
            const titleEl = document.getElementById('auth-title');
            const submitEl = document.getElementById('auth-submit');
            if (titleEl) titleEl.innerText = isSignup ? 'Create your account' : 'Welcome back';
            if (submitEl) submitEl.innerText = isSignup ? 'Create Account' : 'Log in';
        }
    }
};

// Make globally available for inline onclicks
window.router = router;
window.sb = sb;

// --- Theme Handling ---
function initTheme() {
    const savedTheme = localStorage.getItem('dashboard_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = document.querySelector('#theme-toggle i');
        if (icon) icon.className = 'fa-solid fa-sun';
    }
}

window.toggleDarkMode = function () {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('dashboard_theme', isDark ? 'dark' : 'light');

    // Update icon
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// Call init immediately and also on DOMContentLoaded just in case
initTheme();
document.addEventListener('DOMContentLoaded', initTheme);

// --- Auth Handlers ---

window.handleAuth = async function (e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const path = window.location.pathname;

    if (path === '/signup') {
        const { data, error } = await sb.auth.signUp({
            email,
            password
        });

        if (error) {
            showToast(error.message, 'error');
        } else {
            // If email confirmation is enabled, session might be null
            if (data.session) {
                state.user = data.session.user;
                checkUserProfile();
            } else if (data.user && !data.session) {
                showToast('Signup successful! Please check your email to confirm.', 'info');
            } else {
                checkUserProfile();
            }
        }
    } else {
        // Login
        const { data, error } = await sb.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            showToast(error.message, 'error');
        } else {
            state.user = data.user;
            checkUserProfile();
        }
    }
}

window.handleVerify = async function (e) {
    e.preventDefault();
    const email = document.getElementById('email').value || localStorage.getItem('pending_email');
    const token = document.getElementById('otp').value;

    // Note: If using Magic Link, user clicks link in email. 
    // If using OTP code, this Verify is needed.
    const { data, error } = await sb.auth.verifyOtp({
        email,
        token,
        type: 'email'
    });

    if (error) {
        showToast(error.message, 'error');
    } else {
        state.user = data.user;
        checkUserProfile();
    }
}

async function checkUserProfile() {
    const { data: profile, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', state.user.id)
        .single();

    if (profile) {
        state.profile = profile;
        router.navigate('/dashboard');
    } else {
        router.navigate('/onboarding');
    }
}

window.handleOnboarding = async function (e) {
    e.preventDefault();
    const username = document.getElementById('setup-username').value;
    const displayName = document.getElementById('setup-displayname').value;

    const { error } = await sb.from('profiles').insert({
        id: state.user.id,
        username,
        display_name: displayName,
        theme_id: 'default'
    });

    if (error) {
        showToast(error.message, 'error');
    } else {
        checkUserProfile();
    }
}

window.handleClaimUsername = function () {
    const username = document.getElementById('claim-username').value;
    if (username) {
        router.navigate('/signup');
    }
}

// --- Dashboard Logic ---

async function loadDashboard() {
    // Load Profile
    if (!state.profile) await checkUserProfile();

    document.getElementById('edit-title').value = state.profile.display_name || '';
    document.getElementById('edit-bio').value = state.profile.bio || '';
    document.getElementById('avatar-preview').src = state.profile.avatar_url || 'https://via.placeholder.com/100';
    document.getElementById('nav-username').innerText = state.profile.username;

    // Load Socials
    if (document.getElementById('social-email')) {
        document.getElementById('social-email').value = state.profile.social_email || '';
        document.getElementById('social-instagram').value = state.profile.social_instagram || '';
        document.getElementById('social-youtube').value = state.profile.social_youtube || '';
        document.getElementById('social-telegram').value = state.profile.social_telegram || '';
        document.getElementById('social-twitter').value = state.profile.social_twitter || '';
    }

    // Settings
    const settingsEmailEl = document.getElementById('settings-email');
    if (settingsEmailEl && state.user) settingsEmailEl.value = state.user.email;

    // Load Links
    const { data: links } = await sb
        .from('links')
        .select('*')
        .eq('user_id', state.user.id)
        .order('order_index', { ascending: true });

    state.links = links || [];
    renderLinks();
    updatePreview();

    // Update Preview Link
    const linkBtn = document.getElementById('my-link-preview');
    linkBtn.href = `/${state.profile.username}`;

    // Load Custom Colors
    const bgPicker = document.getElementById('btn-bg-picker');
    const textPicker = document.getElementById('btn-text-picker');
    // Default to white/black if null, or keep last valid
    if (state.profile.button_color) bgPicker.value = state.profile.button_color;
    if (state.profile.button_text_color) textPicker.value = state.profile.button_text_color;
}

window.updateCustomColors = async function () {
    const button_color = document.getElementById('btn-bg-picker').value;
    const button_text_color = document.getElementById('btn-text-picker').value;

    state.profile.button_color = button_color;
    state.profile.button_text_color = button_text_color;

    updatePreview();
    await sb.from('profiles').update({ button_color, button_text_color }).eq('id', state.user.id);
}

window.resetCustomColors = async function (type) {
    if (type === 'bg') {
        state.profile.button_color = null;
        document.getElementById('btn-bg-picker').value = '#ffffff'; // visual reset
    }
    if (type === 'text') {
        state.profile.button_text_color = null;
        document.getElementById('btn-text-picker').value = '#000000';
    }
    updatePreview();
    await sb.from('profiles')
        .update({
            button_color: state.profile.button_color,
            button_text_color: state.profile.button_text_color
        })
        .eq('id', state.user.id);
}

// --- Link Management ---

// Helper to trigger hidden input
window.triggerLinkImageUpload = function (linkId) {
    document.getElementById(`file-upload-${linkId}`).click();
}

// Handle upload
window.handleLinkImageUpload = async function (e, linkId) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast('Image too large (max 2MB)', 'error');
        return;
    }

    // Find button to show loading state
    const btn = e.target.parentElement.querySelector('button');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${state.user.id}/links/${linkId}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await sb.storage
            .from('avatars') // Reusing avatars bucket for simplicity, or could make a new one
            .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = sb.storage
            .from('avatars')
            .getPublicUrl(fileName);

        // Update local state
        const link = state.links.find(l => l.id === linkId);
        if (link) {
            link.image_url = publicUrl;
        }

        updatePreview();
        renderLinks(); // re-render to show thumbnail

        // Save to DB
        await sb.from('links').update({ image_url: publicUrl }).eq('id', linkId);
        showToast('Link image updated');

    } catch (err) {
        console.error(err);
        showToast('Upload failed', 'error');
    } finally {
        if (btn) btn.innerHTML = originalContent;
    }
}

// --- Link Management ---

function renderLinks() {
    const container = document.getElementById('links-list');
    container.innerHTML = '';

    state.links.forEach((link, index) => {
        const div = document.createElement('div');
        div.className = 'link-card';
        // HTML for Link Card
        div.innerHTML = `
            <div class="link-drag-handle"><i class="fa-solid fa-grip-vertical"></i></div>
            
            <div style="font-weight: bold; color: var(--text-muted); width: 40px; text-align:center;">#${index + 1}</div>

            <div class="link-inputs">
                <div class="link-input-row">
                    <input type="text" class="title-input" value="${link.title}" 
                        onchange="updateLink('${link.id}', 'title', this.value)" placeholder="Link Title">
                </div>
                <div class="link-input-row">
                    <input type="text" class="url-input" value="${link.url}" 
                        onchange="updateLink('${link.id}', 'url', this.value)" placeholder="https://">
                </div>
            </div>
            <div class="link-actions">
                <label class="switch">
                    <input type="checkbox" ${link.is_enabled ? 'checked' : ''} 
                        onchange="updateLink('${link.id}', 'is_enabled', this.checked)">
                    <span class="slider"></span>
                </label>
                <button onclick="deleteLink('${link.id}')" class="btn btn-ghost"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.addNewLink = async function () {
    const newLink = {
        user_id: state.user.id,
        title: 'New Link',
        url: '',
        is_enabled: true,
        order_index: state.links.length
    };

    const { data, error } = await sb.from('links').insert(newLink).select().single();
    if (data) {
        state.links.push(data);
        renderLinks();
        updatePreview();
    }
}

window.updateLink = async function (id, field, value) {
    const link = state.links.find(l => l.id === id);
    if (link) {
        link[field] = value;
        // Optimistic update
        updatePreview();
        // Server update
        await sb.from('links').update({ [field]: value }).eq('id', id);
    }
}

window.deleteLink = async function (id) {
    if (confirm('Are you sure?')) {
        state.links = state.links.filter(l => l.id !== id);
        renderLinks();
        updatePreview();
        await sb.from('links').delete().eq('id', id);
    }
}

// --- Debounce Helper ---
let debounceTimer;
const debouncedSaveProfile = (data) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        try {
            await sb.from('profiles').update(data).eq('id', state.user.id);
            // Optional: console.log('Profile auto-saved');
        } catch (err) {
            console.error('Error auto-saving profile:', err);
        }
    }, 1000);
};

window.updateProfileMeta = function () {
    const display_name = document.getElementById('edit-title').value;
    const bio = document.getElementById('edit-bio').value;

    // Socials
    const social_email = document.getElementById('social-email')?.value;
    const social_instagram = document.getElementById('social-instagram')?.value;
    const social_youtube = document.getElementById('social-youtube')?.value;
    const social_telegram = document.getElementById('social-telegram')?.value;
    const social_twitter = document.getElementById('social-twitter')?.value;

    // 1. Update Local State Immediately
    state.profile.display_name = display_name;
    state.profile.bio = bio;

    // Only update state if fields exist
    if (social_email !== undefined) {
        state.profile.social_email = social_email;
        state.profile.social_instagram = social_instagram;
        state.profile.social_youtube = social_youtube;
        state.profile.social_telegram = social_telegram;
        state.profile.social_twitter = social_twitter;
    }

    // 2. Update Preview Immediately
    updatePreview();

    // 3. Debounce Server Update
    debouncedSaveProfile({
        display_name,
        bio,
        social_email,
        social_instagram,
        social_youtube,
        social_telegram,
        social_twitter
    });
}

// --- Preview Logic ---

function updatePreview() {
    const iframe = document.getElementById('preview-iframe');
    const doc = iframe.contentWindow.document;

    const profileHtml = generateProfileHtml(state.profile, state.links);

    doc.open();
    doc.write(profileHtml);
    doc.close();
}

function generateProfileHtml(profile, links) {
    if (!profile) return '';

    let themeStyles = `
        :root {
            --bg: #fff;
            --text: #000;
            --btn-bg: #f8f9fa;
            --btn-text: #000;
        }
    `;

    if (profile.theme_id === 'dark') {
        themeStyles = `
            :root {
                --bg: #111;
                --text: #fff;
                --btn-bg: #222;
                --btn-text: #fff;
            }
        `;
    } else if (profile.theme_id === 'gradient-blue') {
        themeStyles = `
            :root {
                --bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                --text: #fff;
                --btn-bg: rgba(255,255,255,0.2);
                --btn-text: #fff;
            }
        `;
    } else if (profile.theme_id === 'forest') {
        themeStyles = `
            :root {
                --bg: #1a2f23;
                --text: #e2e8f0;
                --btn-bg: #2d4a3e;
                --btn-text: #fff;
            }
        `;
    } else if (profile.theme_id === 'sunset') {
        themeStyles = `
            :root {
                --bg: linear-gradient(120deg, #f6d365 0%, #fda085 100%);
                --text: #fff;
                --btn-bg: rgba(255,255,255,0.3);
                --btn-text: #fff;
            }
        `;
    } else if (profile.theme_id === 'ocean') {
        themeStyles = `
            :root {
                --bg: linear-gradient(to top, #30cfd0 0%, #330867 100%);
                --text: #fff;
                --btn-bg: rgba(255,255,255,0.2);
                --btn-text: #fff;
            }
        `;
    } else if (profile.theme_id === 'aurora') {
        themeStyles = `
            @keyframes gradient {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            :root {
                --bg: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
                --text: #fff;
                --btn-bg: rgba(255,255,255,0.25);
                --btn-text: #fff;
            }
            body { 
                background-size: 400% 400% !important; 
                animation: gradient 15s ease infinite; 
            }
        `;
    } else if (profile.theme_id === 'galaxy') {
        themeStyles = `
            :root {
                --bg: linear-gradient(to right, #243949 0%, #517fa4 100%);
                --text: #e0f2fe;
                --btn-bg: rgba(0,0,0,0.3);
                --btn-text: #fff;
            }
            .link-btn { border: 1px solid rgba(255,255,255,0.1); }
        `;
    } else if (profile.theme_id === 'luxury') {
        themeStyles = `
            :root {
                --bg: linear-gradient(to bottom, #141e30, #243b55);
                --text: #f0e68c;
                --btn-bg: rgba(0,0,0,0.6);
                --btn-text: #ffd700;
            }
            .link-btn { border: 1px solid #ffd700; letter-spacing: 1px; text-transform: uppercase; }
            .avatar { border-color: #ffd700 !important; }
        `;
    } else if (profile.theme_id === 'motion') {
        themeStyles = `
            :root {
                --bg: #000;
                --text: #fff;
                --btn-bg: rgba(255, 255, 255, 0.15);
                --btn-text: #fff;
            }
            .video-bg {
                position: fixed;
                right: 0;
                bottom: 0;
                min-width: 100%;
                min-height: 100%;
                z-index: -1;
                object-fit: cover;
                filter: brightness(0.6);
            }
            .link-btn {
                 backdrop-filter: blur(10px);
                 -webkit-backdrop-filter: blur(10px);
                 border: 1px solid rgba(255, 255, 255, 0.2);
            }
        `;
    } else if (profile.theme_id === 'motion-2') {
        themeStyles = `
            :root {
                --bg: #000;
                --text: #fff;
                --btn-bg: rgba(20, 20, 20, 0.6);
                --btn-text: #fff;
            }
            .video-bg {
                position: fixed;
                right: 0;
                bottom: 0;
                min-width: 100%;
                min-height: 100%;
                z-index: -1;
                object-fit: cover;
                filter: brightness(0.5) contrast(1.1);
            }
            .link-btn {
                 backdrop-filter: blur(5px);
                 -webkit-backdrop-filter: blur(5px);
                 border: 1px solid rgba(255, 255, 255, 0.1);
            }
        `;
    } else if (profile.theme_id === 'motion-3') {
        themeStyles = `
            :root {
                --bg: #000;
                --text: #fff;
                --btn-bg: rgba(255, 255, 255, 0.1);
                --btn-text: #fff;
            }
            .video-bg {
                position: fixed;
                right: 0;
                bottom: 0;
                min-width: 100%;
                min-height: 100%;
                z-index: -1;
                object-fit: cover;
                filter: saturate(1.2);
            }
            .link-btn {
                 backdrop-filter: blur(20px);
                 -webkit-backdrop-filter: blur(20px);
                 border: 1px solid rgba(255, 255, 255, 0.3);
                 border-radius: 30px;
            }
        `;
    } else if (profile.theme_id === 'motion-4') {
        themeStyles = `
            :root {
                --bg: #000;
                --text: #e2e8f0;
                --btn-bg: rgba(0, 0, 0, 0.7);
                --btn-text: #fff;
            }
            .video-bg {
                position: fixed;
                right: 0;
                bottom: 0;
                min-width: 100%;
                min-height: 100%;
                z-index: -1;
                object-fit: cover;
                filter: grayscale(0.5) brightness(0.7);
            }
            .link-btn {
                 backdrop-filter: blur(5px);
                 -webkit-backdrop-filter: blur(5px);
                 border-left: 4px solid #f43f5e;
                 border-radius: 4px;
            }
        `;
    } else if (profile.theme_id === 'grid') {
        themeStyles = `
            :root {
                --bg: #f8fafc;
                --text: #0f172a;
                --btn-bg: #fff;
                --btn-text: #1e293b;
            }
            body { max-width: 100%; padding: 2rem 1rem; }
            .links { 
                display: grid; 
                grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); 
                gap: 1rem; 
                width: 100%; 
                max-width: 1000px; 
            }
            .link-btn {
                background: white;
                color: var(--text);
                border-radius: 8px;
                padding: 1rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                transition: transform 0.2s, box-shadow 0.2s;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                position: relative;
                border: 1px solid #e2e8f0;
                min-height: 80px; /* Force rectangle/box shape */
                text-decoration: none;
                font-weight: 600;
            }
            .link-btn:hover { 
                transform: translateY(-2px); 
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                border-color: #cbd5e1;
            }
            
            .link-badge {
                position: absolute;
                top: 0.25rem;
                left: 0.25rem;
                background: #fbbf24;
                color: #000;
                font-weight: 700;
                font-size: 0.75rem;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .link-content {
                margin-top: 0.5rem;
                word-break: break-word;
            }
        `;
    }

    // Custom Color Overrides
    if (profile.button_color && profile.theme_id !== 'grid') {
        themeStyles += ` :root { --btn-bg: ${profile.button_color}; } `;
    }
    if (profile.button_text_color) {
        themeStyles += ` :root { --btn-text: ${profile.button_text_color}; } `;
    }

    const activeLinks = (links || []).filter(l => l.is_enabled);

    let videoHtml = '';

    if (profile.theme_id === 'motion') {
        videoHtml = `<video autoplay muted loop playsinline class="video-bg"><source src="/background-video.mp4" type="video/mp4"></video>`;
    } else if (profile.theme_id === 'motion-2') {
        videoHtml = `<video autoplay muted loop playsinline class="video-bg"><source src="/background-video-2.mp4" type="video/mp4"></video>`;
    } else if (profile.theme_id === 'motion-3') {
        videoHtml = `<video autoplay muted loop playsinline class="video-bg"><source src="/background-video-3.mp4" type="video/mp4"></video>`;
    } else if (profile.theme_id === 'motion-4') {
        videoHtml = `<video autoplay muted loop playsinline class="video-bg"><source src="/background-video-4.mp4" type="video/mp4"></video>`;
    }

    // Social Links HTML
    let socialHtml = '<div class="social-icons" style="display: flex; gap: 1rem; margin-bottom: 2rem; z-index: 1;">';
    if (profile.social_email) socialHtml += `<a href="${profile.social_email.startsWith('mailto:') ? profile.social_email : 'mailto:' + profile.social_email}" target="_blank" style="color: var(--text); font-size: 1.5rem; text-decoration: none; opacity: 0.9; transition: opacity 0.2s;"><i class="fa-regular fa-envelope"></i></a>`;
    if (profile.social_instagram) socialHtml += `<a href="${profile.social_instagram}" target="_blank" style="color: var(--text); font-size: 1.5rem; text-decoration: none; opacity: 0.9; transition: opacity 0.2s;"><i class="fa-brands fa-instagram"></i></a>`;
    if (profile.social_youtube) socialHtml += `<a href="${profile.social_youtube}" target="_blank" style="color: var(--text); font-size: 1.5rem; text-decoration: none; opacity: 0.9; transition: opacity 0.2s;"><i class="fa-brands fa-youtube"></i></a>`;
    if (profile.social_telegram) socialHtml += `<a href="${profile.social_telegram}" target="_blank" style="color: var(--text); font-size: 1.5rem; text-decoration: none; opacity: 0.9; transition: opacity 0.2s;"><i class="fa-brands fa-telegram"></i></a>`;
    if (profile.social_twitter) socialHtml += `<a href="${profile.social_twitter}" target="_blank" style="color: var(--text); font-size: 1.5rem; text-decoration: none; opacity: 0.9; transition: opacity 0.2s;"><i class="fa-brands fa-x-twitter"></i></a>`;
    socialHtml += '</div>';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            ${themeStyles}
            /* Universal Box Sizing */
            * { box-sizing: border-box; }
            
            /* Hide scrollbar completely */
            html, body {
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none; /* IE/Edge */
                overflow-x: hidden;
            }
            html::-webkit-scrollbar, body::-webkit-scrollbar { 
                display: none; /* Chrome/Safari */
                width: 0;
                height: 0;
            }
            
            body { 
                background: var(--bg); 
                color: var(--text); 
                font-family: 'Outfit', sans-serif; 
                margin: 0; 
                padding: 2rem; 
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .avatar {
                width: 96px; height: 96px; border-radius: 50%; object-fit: cover;
                margin-bottom: 1rem; border: 2px solid var(--text);
                z-index: 1; /* Ensure content is above video */
            }
            h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.5rem 0; z-index: 1; }
            p { opacity: 0.8; margin: 0 0 2rem 0; text-align: center; max-width: 400px; line-height: 1.6; z-index: 1; }
            .links { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 1rem; z-index: 1; }
            .link-btn {
                display: block;
                background: var(--btn-bg);
                color: var(--btn-text);
                text-decoration: none;
                padding: 1rem;
                text-align: center;
                border-radius: 12px;
                font-weight: 600;
                transition: transform 0.2s;
                backdrop-filter: blur(5px);
                border: 1px solid rgba(255,255,255,0.1);
            }
            .link-btn:hover { transform: scale(1.02); }
            .branding {
                margin-top: 3rem; opacity: 0.5; font-size: 0.8rem; z-index: 1;
            }
            .search-container {
                width: 100%;
                max-width: 480px;
                margin-bottom: 1.5rem;
                z-index: 1;
                
                
            }
            .search-input {
                width: 100%;
                padding: 1rem;
                border-radius: 12px;
                border: 1px solid var(--btn-text);
                background: var(--btn-bg);
                color: var(--btn-text);
                font-family: inherit;
                font-size: 1rem;
                backdrop-filter: blur(5px);
                outline: none;
                transition: all 0.2s;
            }
            .search-input::placeholder {
                color: var(--btn-text);
                opacity: 0.7;
            }
            .search-input:focus {
                box-shadow: 0 0 0 2px var(--btn-text);
                 transform: translateY(-2px);
            }
        </style>
        <script>
            function filterLinks(query) {
                const links = document.querySelectorAll('.link-btn');
                const q = query.toLowerCase().trim();
                
                // Check if searching by number (e.g., "#1")
                let searchIndex = null;
                if (q.startsWith('#')) {
                    const num = parseInt(q.substring(1));
                    if (!isNaN(num)) {
                        searchIndex = num;
                    }
                }

                links.forEach(link => {
                    const text = link.innerText.toLowerCase();
                    const index = parseInt(link.getAttribute('data-index'));
                    
                    let match = false;
                    
                    // Match by text
                    if (text.includes(q)) {
                        match = true;
                    }
                    
                    // Match by index (if #number syntax used)
                    if (searchIndex !== null && index === searchIndex) {
                        match = true;
                    }

                    link.style.display = match ? (link.classList.contains('grid-item') ? 'flex' : 'block') : 'none';
                });
            }
        </script>
    </head>
    <body>
        ${videoHtml}
        <img src="${profile.avatar_url || 'https://via.placeholder.com/100'}" class="avatar">
        <h1>@${profile.username}</h1>
        <p>${profile.display_name || ''}<br>${profile.bio || ''}</p>
        
        ${socialHtml}
        
        <div class="search-container">
            <input type="text" class="search-input" placeholder="Search links (e.g. 'Twitter' or '#1')" onkeyup="filterLinks(this.value)">
        </div>

        <div class="links">
            ${activeLinks.map((l, index) => {
        const displayIndex = index + 1;
        if (profile.theme_id === 'grid') {
            return `
                    <a href="${l.url}" target="_blank" class="link-btn grid-item" data-index="${displayIndex}">
                        <div class="link-badge">#${displayIndex}</div>
                        <div class="link-content">
                            ${l.title}
                        </div>
                    </a>
                    `;
        } else {
            // Standard List Layout
            // We append a hidden span or use data attribute so search works even if badge isn't visible in other themes?
            // User specifically asked for this. Let's add data-index to all.
            return `
                  <a href="${l.url}" target="_blank" class="link-btn" data-index="${displayIndex}">
                        ${l.icon ? `<i class="${l.icon}"></i> ` : ''}${l.title}
                    </a>
                    `;
        }
    }).join('')}
        </div>
        
        <div class="branding">Made with Bio.Link</div>
    </body>
    </html>
    `;
}

// --- Public View Logic ---

async function renderPublicProfile(username) {
    document.getElementById('app').innerHTML = '<div class="loading">Loading...</div>';

    // Fetch user
    const { data: profile } = await sb.from('profiles').select('*').eq('username', username).single();

    if (!profile) {
        document.getElementById('app').innerHTML = '<h2>User not found</h2><a href="/">Go Home</a>';
        return;
    }

    // Fetch links
    const { data: links } = await sb.from('links').select('*').eq('user_id', profile.id).order('order_index');

    const html = generateProfileHtml(profile, links);

    document.open();
    document.write(html);
    document.close();
}

// --- Image Upload (N8N) ---

window.triggerImageUpload = function () {
    document.getElementById('file-upload').click();
}

window.handleImageUpload = async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate size (e.g., 2MB limit)
    if (file.size > 2 * 1024 * 1024) {
        showToast('Image too large (max 2MB)', 'error');
        return;
    }

    showToast('Uploading image...', 'info');

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${state.user.id}/${Date.now()}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadError } = await sb.storage
            .from('avatars')
            .upload(filePath, file, {
                upsert: true
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data: { publicUrl } } = sb.storage
            .from('avatars')
            .getPublicUrl(filePath);

        // Update State & DB
        state.profile.avatar_url = publicUrl;
        document.getElementById('avatar-preview').src = publicUrl;

        const { error: dbError } = await sb
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', state.user.id);

        if (dbError) throw dbError;

        updatePreview();
        showToast('Image updated successfully');

    } catch (err) {
        console.error('Upload failed:', err);
        showToast(err.message || 'Upload failed', 'error');
    }
}

// --- Themes ---

window.setTheme = async function (themeId) {
    document.querySelectorAll('.theme-card').forEach(el => el.classList.remove('selected'));
    // Visual select logic could be better, but this works for now
    // We would need to find the card that called this.
    // Simplifying for now

    state.profile.theme_id = themeId;
    updatePreview();
    await sb.from('profiles').update({ theme_id: themeId }).eq('id', state.user.id);
}

// --- Helpers ---

window.showToast = function (msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.backgroundColor = type === 'error' ? '#ef4444' : '#1e293b';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

window.switchTab = function (tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // Need currentTarget if called via onclick
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
}

// Init
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) state.user = session.user;

    // Auth Listener
    sb.auth.onAuthStateChange((event, session) => {
        state.user = session?.user || null;
        if (event === 'SIGNED_OUT') router.navigate('/');
    });

    router.resolve();
});

window.onpopstate = () => router.resolve();
