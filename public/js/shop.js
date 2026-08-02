// TypeSprint Shop & Visual Settings Customization Controller

const Shop = {
    activeCategory: 'theme',

    init: () => {
        Shop.bindEvents();
    },

    bindEvents: () => {
        const filterBtns = document.querySelectorAll('.shop-filter');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                Shop.activeCategory = e.target.getAttribute('data-cat');
                Shop.renderCatalog();
            });
        });
    },

    loadShop: async () => {
        try {
            const data = await API.getShop();
            Shop.catalog = data.catalog;
            Shop.owned = data.owned;

            // Update user coins indicators
            if (Auth.currentUser) {
                document.getElementById('shop-user-coins').textContent = `🪙 ${Auth.currentUser.coins}`;
            }

            Shop.renderCatalog();
        } catch (error) {
            console.error('Failed to load shop details:', error);
        }
    },

    renderCatalog: () => {
        const container = document.getElementById('shop-items-catalog');
        container.innerHTML = '';

        if (!Shop.catalog) return;

        const filteredItems = Shop.catalog.filter(item => item.category === Shop.activeCategory);

        filteredItems.forEach(item => {
            const isOwned = Shop.owned.includes(item.id);
            const isEquipped = Auth.currentUser && (
                (item.category === 'theme' && Auth.currentUser.equipped_theme === item.value) ||
                (item.category === 'cursor' && Auth.currentUser.equipped_cursor === item.value) ||
                (item.category === 'badge' && Auth.currentUser.equipped_badge === item.value) ||
                (item.category === 'skin' && Auth.currentUser.equipped_skin === item.value)
            );

            const card = document.createElement('div');
            card.className = 'shop-item-card glassmorphism';
            
            // Visual item preview details
            let previewStyle = '';
            let innerText = '';
            if (item.category === 'theme') {
                previewStyle = `background: ${item.preview_color};`;
            } else if (item.category === 'cursor') {
                innerText = '❘'; // cursor line representation
                previewStyle = `color: ${item.preview_color}; font-weight: 800;`;
            } else if (item.category === 'badge') {
                innerText = item.preview_color; // emoji character representation
            }

            let actButtonHtml = '';
            if (isEquipped) {
                actButtonHtml = `<button class="btn-secondary w-full" disabled>Equipped</button>`;
            } else if (isOwned) {
                actButtonHtml = `<button class="btn-primary w-full btn-equip" data-id="${item.id}" data-cat="${item.category}">Equip Item</button>`;
            } else {
                actButtonHtml = `<button class="btn-primary-glow w-full btn-buy" data-id="${item.id}">Buy (🪙 ${item.price})</button>`;
            }

            card.innerHTML = `
                <div class="item-visual-preview" style="${previewStyle}">${innerText}</div>
                <h4>${item.name}</h4>
                <span class="item-price">🪙 ${item.price} Coins</span>
                ${actButtonHtml}
            `;
            container.appendChild(card);
        });

        // Bind item buy/equip handlers
        container.querySelectorAll('.btn-buy').forEach(btn => {
            btn.addEventListener('click', Shop.handleBuy);
        });

        container.querySelectorAll('.btn-equip').forEach(btn => {
            btn.addEventListener('click', Shop.handleEquip);
        });
    },

    handleBuy: async (e) => {
        const itemId = e.target.getAttribute('data-id');
        try {
            const data = await API.buyItem(itemId);
            App.showToast(data.message, 'success');
            
            // Refresh shop state
            if (Auth.currentUser) {
                Auth.currentUser.coins = data.newCoinsBalance;
            }
            await Shop.loadShop();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    handleEquip: async (e) => {
        const itemId = e.target.getAttribute('data-id');
        const category = e.target.getAttribute('data-cat');

        try {
            const data = await API.equipItem(category, itemId);
            App.showToast(data.message, 'success');

            // Apply theme changes dynamically to body
            if (category === 'theme') {
                const item = Shop.catalog.find(i => i.id === itemId);
                if (item) {
                    // Strip previous theme classes
                    document.body.className = '';
                    document.body.classList.add(item.value);
                }
            }

            // Sync auth profiles details
            await Auth.checkAuthStatus();
            await Shop.loadShop();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    }
};

window.Shop = Shop;
