// TypeSprint Central API & Socket Manager

const API_BASE_URL = (window.ENV && window.ENV.API_BASE_URL) || '/api';

// Authentication token cache
let authToken = localStorage.getItem('authToken') || null;
let activeSocket = null;

/**
 * Fetch with Authorization header injected
 */
async function request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Inject headers
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const config = {
        ...options,
        headers
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'API Request Failed');
        }
        return data;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error.message);
        throw error;
    }
}

/**
 * REST API wrapper methods
 */
const API = {
    // Auth endpoints
    register: (username, email, password) => request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
    }),
    login: (usernameOrEmail, password, rememberMe) => request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ usernameOrEmail, password, rememberMe })
    }),
    status: () => request('/auth/status', { method: 'GET' }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    forgotPassword: (email) => request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
    }),
    resetPassword: (email, code, newPassword) => request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword })
    }),

    // Profile & Stats endpoints
    getProfile: () => request('/profile', { method: 'GET' }),
    getPublicProfile: (username) => request(`/profile/public/${username}`, { method: 'GET' }),
    updateProfile: (displayName, country, bio, avatar) => request('/profile/update', {
        method: 'PUT',
        body: JSON.stringify({ displayName, country, bio, avatar })
    }),
    getStats: () => request('/profile/stats', { method: 'GET' }),
    getHeatmap: () => request('/profile/heatmap', { method: 'GET' }),
    equipItem: (category, itemId) => request('/profile/equip', {
        method: 'PUT',
        body: JSON.stringify({ category, itemId })
    }),

    // Typing and texts endpoints
    getText: (mode, difficulty, language, wordCount) => {
        const query = new URLSearchParams({ mode, difficulty, language, wordCount }).toString();
        return request(`/typing/text?${query}`, { method: 'GET' });
    },
    submitResults: (results) => request('/typing/results', {
        method: 'POST',
        body: JSON.stringify(results)
    }),

    // Shop endpoints
    getShop: () => request('/shop', { method: 'GET' }),
    buyItem: (itemId) => request('/shop/buy', {
        method: 'POST',
        body: JSON.stringify({ itemId })
    }),

    // Social & Friends endpoints
    getFriends: () => request('/social/friends', { method: 'GET' }),
    getFriendRequests: () => request('/social/requests', { method: 'GET' }),
    searchUsers: (query) => request(`/social/search?query=${encodeURIComponent(query)}`, { method: 'GET' }),
    sendFriendRequest: (receiverId) => request('/social/request/send', {
        method: 'POST',
        body: JSON.stringify({ receiverId })
    }),
    acceptFriendRequest: (senderId) => request('/social/request/accept', {
        method: 'POST',
        body: JSON.stringify({ senderId })
    }),
    declineFriendRequest: (senderId) => request('/social/request/decline', {
        method: 'POST',
        body: JSON.stringify({ senderId })
    }),
    getChatMessages: (friendId) => request(`/social/chat/${friendId}`, { method: 'GET' }),
    sendChatMessage: (receiverId, message) => request('/social/chat/send', {
        method: 'POST',
        body: JSON.stringify({ receiverId, message })
    }),

    // Admin endpoints
    getAdminDashboard: () => request('/admin/dashboard', { method: 'GET' }),
    getAdminUsers: () => request('/admin/users', { method: 'GET' }),
    addQuote: (quote) => request('/admin/quotes', {
        method: 'POST',
        body: JSON.stringify(quote)
    }),
    addCodeSnippet: (snippet) => request('/admin/code', {
        method: 'POST',
        body: JSON.stringify(snippet)
    }),
    deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),

    // Token management
    setToken: (token) => {
        authToken = token;
        if (token) {
            localStorage.setItem('authToken', token);
        } else {
            localStorage.removeItem('authToken');
        }
        // Reconnect socket with new token
        API.connectSocket();
    },
    getToken: () => authToken,

    // Socket Connection Setup
    connectSocket: () => {
        if (activeSocket) {
            activeSocket.disconnect();
        }
        // Establish connection via Socket.io
        const socketUrl = (window.ENV && window.ENV.SOCKET_URL) || undefined;
        activeSocket = io(socketUrl, {
            auth: { token: authToken }
        });
        
        activeSocket.on('connect', () => {
            console.log('🔌 Socket.io connected. Handshake ID:', activeSocket.id);
        });

        return activeSocket;
    },
    getSocket: () => {
        if (!activeSocket) {
            return API.connectSocket();
        }
        return activeSocket;
    }
};

window.API = API;
