// TypeSprint Friends Chat & Direct Challenges Controller

const Social = {
    activeChatFriendId: null,
    activeChatUsername: "",
    friends: [],
    
    init: () => {
        Social.bindEvents();
    },

    bindEvents: () => {
        // Direct Send message
        document.getElementById('btn-send-direct-msg').addEventListener('click', Social.sendChatMessage);
        document.getElementById('input-direct-message').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') Social.sendChatMessage();
        });

        // Search user binding
        const searchInput = document.getElementById('input-search-friends');
        searchInput.addEventListener('input', App.debounce(Social.handleUserSearch, 400));

        // Challenges invite trigger
        document.getElementById('btn-invite-challenge').addEventListener('click', Social.sendChallengeInvite);

        // Sidebar tab switching
        document.getElementById('btn-tab-friends').addEventListener('click', (e) => {
            document.getElementById('btn-tab-requests').classList.remove('active');
            e.target.classList.add('active');
            Social.loadFriendsList();
        });

        document.getElementById('btn-tab-requests').addEventListener('click', (e) => {
            document.getElementById('btn-tab-friends').classList.remove('active');
            e.target.classList.add('active');
            Social.loadRequestsList();
        });
    },

    loadSocialPanel: () => {
        Social.loadFriendsList();
        Social.updateRequestsBadgeCount();
        
        // Connect socket listener for direct chats
        const socket = API.getSocket();
        socket.on('new_chat_message', (msg) => {
            if (Social.activeChatFriendId && (msg.sender_id === Social.activeChatFriendId || msg.sender_id === Auth.currentUser.id)) {
                Social.appendChatMessage(msg);
            }
        });
    },

    loadFriendsList: async () => {
        try {
            const data = await API.getFriends();
            Social.friends = data.friends;

            const list = document.getElementById('social-list-target');
            list.innerHTML = '';

            if (Social.friends.length === 0) {
                list.innerHTML = `<div class="shortcuts-legend" style="text-align:center; padding: 20px;">No friends added yet.</div>`;
                return;
            }

            Social.friends.forEach(f => {
                const isActive = f.id === Social.activeChatFriendId;
                
                // Simple online evaluation (active within last 5 minutes)
                const lastActive = new Date(f.last_active);
                const isOnline = (new Date() - lastActive) < 5 * 60 * 1000;
                const statusClass = isOnline ? 'online' : 'offline';

                const item = document.createElement('div');
                item.className = `friend-slot-card ${isActive ? 'active' : ''}`;
                item.innerHTML = `
                    <div class="slot-profile-group">
                        <img src="/assets/images/avatar-${f.avatar || 'default'}.svg" alt="Avatar" class="avatar-sm">
                        <div class="slot-names">
                            <h5>${f.display_name || f.username}</h5>
                            <span class="slot-level">Lv.${f.typing_level} | ${f.highest_wpm} WPM</span>
                        </div>
                    </div>
                    <div class="slot-status-dot ${statusClass}"></div>
                `;

                // Clicking list item opens chat
                item.addEventListener('click', () => Social.openChatWithFriend(f.id, f.username, f.avatar, isOnline));
                list.appendChild(item);
            });
        } catch (error) {
            console.error('Failed to load friends list:', error);
        }
    },

    loadRequestsList: async () => {
        try {
            const data = await API.getFriendRequests();
            const list = document.getElementById('social-list-target');
            list.innerHTML = '';

            if (data.received.length === 0 && data.sent.length === 0) {
                list.innerHTML = `<div class="shortcuts-legend" style="text-align:center; padding: 20px;">No pending requests.</div>`;
                return;
            }

            // Render received requests
            data.received.forEach(r => {
                const item = document.createElement('div');
                item.className = 'friend-slot-card';
                item.innerHTML = `
                    <div class="slot-profile-group">
                        <img src="/assets/images/avatar-${r.avatar || 'default'}.svg" class="avatar-sm">
                        <div class="slot-names">
                            <h5>${r.display_name || r.username}</h5>
                            <span class="slot-level">wants to add you</span>
                        </div>
                    </div>
                    <div style="display:flex; gap: 4px;">
                        <button class="btn-primary btn-accept" data-id="${r.id}" style="padding: 4px 8px; font-size: 0.75rem;">Accept</button>
                        <button class="btn-secondary btn-decline" data-id="${r.id}" style="padding: 4px 8px; font-size: 0.75rem;">Decline</button>
                    </div>
                `;
                list.appendChild(item);
            });

            // Bind accept/decline buttons
            list.querySelectorAll('.btn-accept').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    await API.acceptFriendRequest(id);
                    App.showToast('Friend request accepted.', 'success');
                    Social.loadRequestsList();
                    Social.updateRequestsBadgeCount();
                });
            });

            list.querySelectorAll('.btn-decline').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    await API.declineFriendRequest(id);
                    App.showToast('Request declined.', 'info');
                    Social.loadRequestsList();
                    Social.updateRequestsBadgeCount();
                });
            });

        } catch (error) {
            console.error('Failed to load requests list:', error);
        }
    },

    updateRequestsBadgeCount: async () => {
        try {
            const data = await API.getFriendRequests();
            const badge = document.getElementById('requests-badge-count');
            const count = data.received.length;
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (error) {
            console.error(error);
        }
    },

    handleUserSearch: async () => {
        const query = document.getElementById('input-search-friends').value;
        const resultsBox = document.getElementById('friends-search-results');

        if (!query || query.trim().length < 2) {
            resultsBox.classList.add('hidden');
            return;
        }

        try {
            const data = await API.searchUsers(query);
            resultsBox.innerHTML = '';
            resultsBox.classList.remove('hidden');

            if (data.users.length === 0) {
                resultsBox.innerHTML = `<div class="search-result-row">No users found.</div>`;
                return;
            }

            data.users.forEach(u => {
                const row = document.createElement('div');
                row.className = 'search-result-row';
                row.innerHTML = `
                    <span>${u.display_name || u.username} (Lv.${u.typing_level})</span>
                    <button class="btn-primary btn-add-user" data-id="${u.id}" style="padding: 4px 8px; font-size: 0.75rem;">+ Add</button>
                `;
                resultsBox.appendChild(row);
            });

            resultsBox.querySelectorAll('.btn-add-user').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    try {
                        await API.sendFriendRequest(id);
                        App.showToast('Friend request sent!', 'success');
                        resultsBox.classList.add('hidden');
                        document.getElementById('input-search-friends').value = '';
                    } catch (err) {
                        App.showToast(err.message, 'error');
                    }
                });
            });

        } catch (error) {
            console.error('Search error:', error);
        }
    },

    openChatWithFriend: async (friendId, username, avatar, isOnline) => {
        Social.activeChatFriendId = friendId;
        Social.activeChatUsername = username;

        // Visual layout switches
        document.querySelector('.chat-placeholder').classList.add('hidden');
        const chatBox = document.getElementById('direct-chat-interface');
        chatBox.classList.remove('hidden');

        document.getElementById('active-chat-username').textContent = username;
        document.getElementById('active-chat-avatar').src = `/assets/images/avatar-${avatar || 'default'}.svg`;
        
        const statusEl = document.getElementById('active-chat-status');
        statusEl.className = `status-txt ${isOnline ? 'online' : 'offline'}`;
        statusEl.textContent = isOnline ? 'online' : 'offline';

        // Connect room
        const socket = API.getSocket();
        socket.emit('join_chat_lobby', friendId);

        // Fetch logs
        try {
            const data = await API.getChatMessages(friendId);
            const container = document.getElementById('direct-chat-messages-container');
            container.innerHTML = '';

            data.messages.forEach(msg => {
                Social.appendChatMessage(msg);
            });

        } catch (error) {
            console.error('Failed to get chat messages:', error);
        }
    },

    sendChatMessage: async () => {
        const input = document.getElementById('input-direct-message');
        const text = input.value.trim();
        if (!text || !Social.activeChatFriendId) return;

        try {
            // Write to database
            const data = await API.sendChatMessage(Social.activeChatFriendId, text);
            
            // Broadcast via WebSocket
            const socket = API.getSocket();
            socket.emit('send_chat_message', {
                receiverId: Social.activeChatFriendId,
                message: text
            });

            input.value = '';
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    appendChatMessage: (msg) => {
        const container = document.getElementById('direct-chat-messages-container');
        const isOutgoing = msg.sender_id === Auth.currentUser.id;

        const wrapper = document.createElement('div');
        wrapper.className = `msg-bubble-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`;
        
        const timeFormatted = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        wrapper.innerHTML = `
            <div class="msg-bubble">${msg.message}</div>
            <span class="msg-timestamp">${timeFormatted}</span>
        `;
        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;
    },

    sendChallengeInvite: () => {
        if (!Social.activeChatFriendId) return;
        
        // 1. Generate multiplayer room code
        Multiplayer.ensureSocket();
        Multiplayer.socket.emit('create_room');

        // 2. Listen for room code assignment and send it automatically via DM
        const onceRoomCreated = (data) => {
            const code = data.roomCode;
            const challengeText = `⚔️ Typing Challenge Invite! Join my lobby room. Code: ${code} . Go to Multiplayer tab and enter code.`;
            
            // Send challenge DM
            Social.socketChallengeSend(challengeText);
            
            // Unbind listener
            Multiplayer.socket.off('room_joined', onceRoomCreated);

            // Redirect user views to Multiplayer Section
            App.loadSection('multiplayer-section');
        };

        Multiplayer.socket.on('room_joined', onceRoomCreated);
    },

    socketChallengeSend: async (text) => {
        try {
            await API.sendChatMessage(Social.activeChatFriendId, text);
            const socket = API.getSocket();
            socket.emit('send_chat_message', {
                receiverId: Social.activeChatFriendId,
                message: text
            });
        } catch (error) {
            console.error('Challenge dispatch error:', error);
        }
    }
};

window.Social = Social;
