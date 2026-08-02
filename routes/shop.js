const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route   GET /api/shop
 * @desc    Get all customization items and identify which ones the user already owns
 */
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        // Fetch all shop items
        const catalog = await db.query('SELECT * FROM shop_items');
        
        // Fetch user's purchased items
        const ownedResult = await db.query(
            'SELECT item_id FROM purchases WHERE user_id = $1',
            [req.user.id]
        );
        const ownedItemIds = ownedResult.rows.map(r => r.item_id);

        res.status(200).json({
            catalog: catalog.rows,
            owned: ownedItemIds
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/shop/buy
 * @desc    Purchase a customization item using typing coins
 */
router.post('/buy', authenticateToken, async (req, res, next) => {
    try {
        const { itemId } = req.body;

        if (!itemId) {
            return res.status(400).json({ error: 'Please specify the item ID to purchase.' });
        }

        // Check if item exists in catalog
        const itemResult = await db.query('SELECT * FROM shop_items WHERE id = $1', [itemId]);
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ error: 'Item not found in the shop catalog.' });
        }
        
        const item = itemResult.rows[0];

        // Check if user already owns it
        const ownedResult = await db.query(
            'SELECT 1 FROM purchases WHERE user_id = $1 AND item_id = $2',
            [req.user.id, itemId]
        );

        if (ownedResult.rows.length > 0) {
            return res.status(400).json({ error: 'You already own this customization item.' });
        }

        // Get user coins balance
        const profileResult = await db.query('SELECT coins FROM profiles WHERE user_id = $1', [req.user.id]);
        if (profileResult.rows.length === 0) {
            return res.status(404).json({ error: 'User profile not found.' });
        }

        const currentCoins = profileResult.rows[0].coins;
        if (currentCoins < item.price) {
            return res.status(400).json({
                error: `Insufficient coins. This item costs ${item.price} coins, but you only have ${currentCoins}.`
            });
        }

        // Subtract coins and save purchase
        const newBalance = currentCoins - item.price;
        await db.query('UPDATE profiles SET coins = $1 WHERE user_id = $2', [newBalance, req.user.id]);
        
        await db.query(
            'INSERT INTO purchases (user_id, item_id) VALUES ($1, $2)',
            [req.user.id, itemId]
        );

        res.status(200).json({
            message: `Successfully purchased ${item.name}!`,
            purchasedItemId: itemId,
            newCoinsBalance: newBalance
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
