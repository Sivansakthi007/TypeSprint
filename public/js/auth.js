// TypeSprint Authentication Controller

const Auth = {
    currentUser: null,

    init: () => {
        Auth.bindEvents();
        Auth.checkAuthStatus();
    },

    bindEvents: () => {
        // Tab switching inside Auth Modal
        document.getElementById('tab-login').addEventListener('click', () => Auth.switchTab('login'));
        document.getElementById('tab-register').addEventListener('click', () => Auth.switchTab('register'));

        // Forms handlers
        document.getElementById('form-login').addEventListener('submit', Auth.handleLogin);
        document.getElementById('form-register').addEventListener('submit', Auth.handleRegister);

        // Forgot Password links
        document.getElementById('link-forgot-pw').addEventListener('click', (e) => {
            e.preventDefault();
            Auth.switchTab('recovery');
        });
        document.getElementById('link-back-login').addEventListener('click', (e) => {
            e.preventDefault();
            Auth.switchTab('login');
        });

        // Trigger request code
        document.getElementById('btn-request-recovery').addEventListener('click', Auth.handleForgotPassword);
        document.getElementById('btn-submit-recovery').addEventListener('click', Auth.handleResetPassword);

        // Header logout action (triggers from profile section too)
        document.getElementById('btn-auth-logout').addEventListener('click', Auth.handleLogout);

        // Modal triggers
        document.getElementById('btn-show-login').addEventListener('click', () => Auth.showModal(true));
        document.getElementById('btn-auth-close').addEventListener('click', () => Auth.showModal(false));
    },

    showModal: (show) => {
        const modal = document.getElementById('auth-modal');
        if (show) {
            modal.classList.remove('hidden');
            Auth.switchTab('login');
        } else {
            modal.classList.add('hidden');
        }
    },

    switchTab: (tab) => {
        const formLogin = document.getElementById('form-login');
        const formRegister = document.getElementById('form-register');
        const formRecovery = document.getElementById('form-recovery');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');

        formLogin.classList.add('hidden');
        formRegister.classList.add('hidden');
        formRecovery.classList.add('hidden');
        tabLogin.classList.remove('active');
        tabRegister.classList.remove('active');

        if (tab === 'login') {
            formLogin.classList.remove('hidden');
            tabLogin.classList.add('active');
        } else if (tab === 'register') {
            formRegister.classList.remove('hidden');
            tabRegister.classList.add('active');
        } else if (tab === 'recovery') {
            formRecovery.classList.remove('hidden');
            document.getElementById('recovery-step-1').classList.remove('hidden');
            document.getElementById('recovery-step-2').classList.add('hidden');
        }
    },

    checkAuthStatus: async () => {
        try {
            const data = await API.status();
            if (data.authenticated) {
                Auth.currentUser = data.user;
                Auth.updateHeader(true);
            } else {
                Auth.currentUser = null;
                Auth.updateHeader(false);
            }
        } catch (error) {
            Auth.currentUser = null;
            Auth.updateHeader(false);
        }
    },

    handleLogin: async (e) => {
        e.preventDefault();
        const usernameOrEmail = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('login-remember-me').checked;

        try {
            const data = await API.login(usernameOrEmail, password, rememberMe);
            API.setToken(data.token);
            Auth.currentUser = data.user;
            Auth.updateHeader(true);
            Auth.showModal(false);
            
            App.showToast('Successfully logged in!', 'success');
            
            // Reload active sections
            App.loadSection(App.currentSection);
            
            // Clear inputs
            e.target.reset();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    handleRegister: async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        try {
            const data = await API.register(username, email, password);
            API.setToken(data.token);
            Auth.currentUser = data.user;
            Auth.updateHeader(true);
            Auth.showModal(false);
            
            App.showToast('Account registered successfully!', 'success');
            
            // Reload
            App.loadSection(App.currentSection);
            e.target.reset();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    handleForgotPassword: async () => {
        const email = document.getElementById('recover-email').value;
        if (!email) return App.showToast('Please enter an email.', 'error');

        try {
            const data = await API.forgotPassword(email);
            App.showToast(data.message, 'info');
            
            // Expose dev mock code in UI for local testing
            if (data.code) {
                document.getElementById('recovery-dev-code').textContent = data.code;
            }
            
            // Switch steps
            document.getElementById('recovery-step-1').classList.add('hidden');
            document.getElementById('recovery-step-2').classList.remove('hidden');
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    handleResetPassword: async () => {
        const email = document.getElementById('recover-email').value;
        const code = document.getElementById('recover-code').value;
        const newPassword = document.getElementById('recover-new-password').value;

        try {
            const data = await API.resetPassword(email, code, newPassword);
            App.showToast(data.message, 'success');
            Auth.switchTab('login');
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    handleLogout: async () => {
        try {
            await API.logout();
            API.setToken(null);
            Auth.currentUser = null;
            Auth.updateHeader(false);
            App.showToast('Logged out successfully.', 'info');
            App.loadSection('home-section');
        } catch (error) {
            console.error('Logout error:', error);
        }
    },

    updateHeader: (isAuthed) => {
        const guestNav = document.getElementById('auth-nav-guest');
        const userNav = document.getElementById('auth-nav-user');
        const adminItem = document.querySelector('.nav-item.admin-only');

        if (isAuthed && Auth.currentUser) {
            guestNav.classList.add('hidden');
            userNav.classList.remove('hidden');

            document.getElementById('nav-user-name').textContent = Auth.currentUser.display_name || Auth.currentUser.username;
            document.getElementById('nav-user-level').textContent = `Lv.${Auth.currentUser.typing_level || 1}`;
            
            // Set user avatar
            const avatar = Auth.currentUser.avatar || 'default';
            document.getElementById('nav-user-avatar').src = `/assets/images/avatar-${avatar}.svg`;

            // Admin toggle visibility
            if (Auth.currentUser.role === 'admin') {
                adminItem.classList.remove('hidden');
            } else {
                adminItem.classList.add('hidden');
            }
        } else {
            guestNav.classList.remove('hidden');
            userNav.classList.add('hidden');
            adminItem.classList.add('hidden');
        }
    }
};

window.Auth = Auth;
