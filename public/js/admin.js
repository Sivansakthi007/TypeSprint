// TypeSprint Admin Panel Interface Controller

const Admin = {
    init: () => {
        Admin.bindEvents();
    },

    bindEvents: () => {
        // Mode switch triggers form inputs visibility
        const contentMode = document.getElementById('admin-content-mode');
        contentMode.addEventListener('change', (e) => {
            const mode = e.target.value;
            if (mode === 'quote') {
                document.getElementById('admin-fields-quote').classList.remove('hidden');
                document.getElementById('admin-fields-code').classList.add('hidden');
            } else {
                document.getElementById('admin-fields-quote').classList.add('hidden');
                document.getElementById('admin-fields-code').classList.remove('hidden');
            }
        });

        // Submit form content
        document.getElementById('btn-admin-submit-content').addEventListener('click', Admin.handleContentSubmission);
    },

    loadDashboard: async () => {
        if (!Auth.currentUser || Auth.currentUser.role !== 'admin') return;

        try {
            // Fetch stats summary
            const data = await API.getAdminDashboard();
            
            document.getElementById('admin-stat-users').textContent = data.metrics.total_users;
            document.getElementById('admin-stat-games').textContent = data.metrics.total_games_played;
            document.getElementById('admin-stat-wpm').textContent = data.metrics.average_wpm;
            document.getElementById('admin-stat-acc').textContent = `${data.metrics.average_accuracy}%`;

            // Fetch user list
            Admin.loadUsersList();
        } catch (error) {
            console.error('Failed to load admin summary dashboards:', error);
        }
    },

    loadUsersList: async () => {
        try {
            const data = await API.getAdminUsers();
            const target = document.getElementById('admin-users-target');
            target.innerHTML = '';

            data.users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${u.id}</td>
                    <td>${u.display_name || u.username}</td>
                    <td>${u.role}</td>
                    <td>Lv.${u.typing_level}</td>
                    <td>${u.games_played}</td>
                    <td>
                        <button class="btn-danger btn-delete-user" data-id="${u.id}" style="padding: 4px 8px; font-size: 0.75rem;">Delete</button>
                    </td>
                `;
                
                // Block deleting yourself
                if (u.id === Auth.currentUser.id) {
                    tr.querySelector('.btn-delete-user').setAttribute('disabled', true);
                }

                target.appendChild(tr);
            });

            // Bind delete user handlers
            target.querySelectorAll('.btn-delete-user').forEach(btn => {
                btn.addEventListener('click', Admin.handleDeleteUser);
            });

        } catch (error) {
            console.error('Failed to load user lists:', error);
        }
    },

    handleContentSubmission: async () => {
        const mode = document.getElementById('admin-content-mode').value;

        if (mode === 'quote') {
            const author = document.getElementById('admin-quote-author').value;
            const text = document.getElementById('admin-quote-text').value;
            const difficulty = document.getElementById('admin-quote-diff').value;

            if (!text) return App.showToast('Please specify the quote text.', 'error');

            try {
                await API.addQuote({ author, text, difficulty });
                App.showToast('Quote saved successfully!', 'success');
                
                // Clear fields
                document.getElementById('admin-quote-author').value = '';
                document.getElementById('admin-quote-text').value = '';
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        } else {
            const title = document.getElementById('admin-code-title').value;
            const language = document.getElementById('admin-code-lang').value;
            const code = document.querySelector('#admin-fields-code textarea').value;
            const difficulty = document.getElementById('admin-code-diff').value;

            if (!code) return App.showToast('Please paste the source code snippet.', 'error');

            try {
                await API.addCodeSnippet({ title, language, code, difficulty });
                App.showToast('Code snippet saved successfully!', 'success');
                
                // Clear fields
                document.getElementById('admin-code-title').value = '';
                document.querySelector('#admin-fields-code textarea').value = '';
            } catch (error) {
                App.showToast(error.message, 'error');
            }
        }
    },

    handleDeleteUser: async (e) => {
        const id = e.target.getAttribute('data-id');
        if (!confirm('Are you absolutely sure you want to delete this user account? All stats will be permanently wiped.')) return;

        try {
            await API.deleteUser(id);
            App.showToast('User account successfully deleted.', 'success');
            Admin.loadUsersList();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    }
};

window.Admin = Admin;
