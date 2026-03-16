const jwt = require('jsonwebtoken');
const {
  createSellOrder,
  getSellOrderById,
  getSellOrdersByUser,
  getApprovedOrders,
  getAllSellOrders,
  updateSellOrderStatus,
  createPurchase,
  getPurchaseById,
  getPurchasesBySellOrder,
  getPurchasesByBuyer,
  getAllPurchases,
  updatePurchaseStatus,
  restoreSellOrderAmount,
  checkAndCompleteSellOrder,
  getLockedBalance,
} = require('../models/marketplaceModel');
const { getAvailableBalance } = require('../models/depositModel');
const { createTransfer } = require('../models/transferModel');

const JWT_SECRET = process.env.JWT_SECRET || 'vc-coin-secret';

const getUserFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch {
    return null;
  }
};

// User: create a sell order (auto-approved, with optional QR upload)
const createOrder = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { amount, price_per_vc, seller_upi } = req.body;
    const seller_qr = req.file ? req.file.filename : null;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Enter a valid VC amount.' });
    }
    if (Number(amount) < 10) {
      return res.status(400).json({ message: 'Minimum sell amount is 10 VC.' });
    }
    if (!price_per_vc || Number(price_per_vc) <= 0) {
      return res.status(400).json({ message: 'Enter a valid price per VC.' });
    }
    if (!seller_upi && !seller_qr) {
      return res.status(400).json({ message: 'Provide UPI ID or QR code image.' });
    }

    const { available } = await getAvailableBalance(decoded.sub);
    const needed = Number(amount);

    if (available < needed) {
      return res.status(400).json({
        message: `Insufficient balance. You need ${needed.toFixed(2)} VC. Available: ${Math.max(0, available).toFixed(2)} VC.`,
      });
    }

    const order = await createSellOrder({
      seller_id: decoded.sub,
      amount: Number(amount),
      price_per_vc: Number(price_per_vc),
      seller_upi: seller_upi ? seller_upi.trim() : null,
      seller_qr,
    });

    res.status(201).json({ order, message: 'Sell order listed on marketplace!' });
  } catch (error) {
    console.error('Create sell order error:', error);
    res.status(500).json({ message: 'Failed to create sell order.' });
  }
};

// User: my sell orders (with purchases on each order)
const myOrders = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const orders = await getSellOrdersByUser(decoded.sub);
    const ordersWithPurchases = await Promise.all(
      orders.map(async (o) => {
        const purchases = await getPurchasesBySellOrder(o.id);
        return { ...o, purchases };
      })
    );

    const locked = await getLockedBalance(decoded.sub);
    res.json({ orders: ordersWithPurchases, lockedBalance: locked });
  } catch (error) {
    console.error('My sell orders error:', error);
    res.status(500).json({ message: 'Failed to fetch sell orders.' });
  }
};

// User: browse marketplace (approved orders with remaining VC)
const marketplace = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const orders = await getApprovedOrders(decoded.sub);
    res.json({ orders });
  } catch (error) {
    console.error('Marketplace error:', error);
    res.status(500).json({ message: 'Failed to fetch marketplace.' });
  }
};

// User: buy partial amount from a sell order (upload payment proof)
const buyOrder = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const { amount } = req.body;
    const order = await getSellOrderById(id);

    if (!order) return res.status(404).json({ message: 'Sell order not found.' });
    if (order.status !== 'approved') return res.status(400).json({ message: 'This order is no longer available.' });
    if (order.seller_id === decoded.sub) return res.status(400).json({ message: 'You cannot buy your own order.' });

    const buyAmount = Number(amount);
    if (!buyAmount || buyAmount <= 0) return res.status(400).json({ message: 'Enter a valid VC amount.' });

    const remaining = Number(order.remaining_amount || order.amount);
    if (buyAmount > remaining) {
      return res.status(400).json({ message: `Only ${remaining.toFixed(2)} VC available in this order.` });
    }

    const payment_proof = req.file ? req.file.filename : null;
    if (!payment_proof) return res.status(400).json({ message: 'Please upload payment screenshot.' });

    const purchase = await createPurchase({
      sell_order_id: order.id,
      buyer_id: decoded.sub,
      amount: buyAmount,
      price_per_vc: Number(order.price_per_vc),
      payment_proof,
    });

    res.json({
      purchase,
      message: `Purchase submitted! Admin will verify payment and ${buyAmount.toFixed(2)} VC will be added to your wallet.`,
    });
  } catch (error) {
    console.error('Buy order error:', error);
    res.status(500).json({ message: 'Purchase failed.' });
  }
};

// User: my purchases (as buyer)
const myPurchases = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const purchases = await getPurchasesByBuyer(decoded.sub);
    res.json({ purchases });
  } catch (error) {
    console.error('My purchases error:', error);
    res.status(500).json({ message: 'Failed to fetch purchases.' });
  }
};

// Admin: list all sell orders + all purchases + stats
const adminListAll = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const orders = await getAllSellOrders();
    const purchases = await getAllPurchases();

    let active = 0, completed = 0, cancelled = 0;
    orders.forEach((o) => {
      if (o.status === 'approved') active++;
      else if (o.status === 'completed') completed++;
      else if (o.status === 'cancelled' || o.status === 'rejected') cancelled++;
    });

    let pendingPurchases = 0, approvedPurchases = 0, rejectedPurchases = 0;
    let totalVolume = 0, totalRevenue = 0;
    purchases.forEach((p) => {
      if (p.status === 'pending') pendingPurchases++;
      else if (p.status === 'approved') {
        approvedPurchases++;
        totalVolume += Number(p.amount || 0);
        totalRevenue += Number(p.total_price || 0);
      } else if (p.status === 'rejected') rejectedPurchases++;
    });

    res.json({
      orders,
      purchases,
      stats: { active, completed, cancelled, pendingPurchases, approvedPurchases, rejectedPurchases, totalVolume, totalRevenue },
    });
  } catch (error) {
    console.error('Admin marketplace error:', error);
    res.status(500).json({ message: 'Failed to fetch marketplace data.' });
  }
};

// Admin: approve/reject a purchase → on approve, transfer VC
const adminUpdatePurchaseStatus = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use approved or rejected.' });
    }

    const purchase = await getPurchaseById(id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found.' });
    if (purchase.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending purchases can be updated.' });
    }

    if (status === 'approved') {
      await createTransfer({
        sender_id: purchase.seller_id,
        receiver_id: purchase.buyer_id,
        amount: Number(purchase.amount),
        note: `Marketplace purchase #${purchase.id} (Order #${purchase.sell_order_id})`,
      });
    }

    if (status === 'rejected') {
      await restoreSellOrderAmount(purchase.sell_order_id, Number(purchase.amount));
    }

    const updated = await updatePurchaseStatus(id, status, admin_note);

    // Auto-complete sell order if fully sold with no pending purchases
    await checkAndCompleteSellOrder(purchase.sell_order_id);

    res.json({ purchase: updated, message: `Purchase ${status} successfully.` });
  } catch (error) {
    console.error('Admin update purchase error:', error);
    res.status(500).json({ message: 'Failed to update purchase.' });
  }
};

// Seller: approve/reject a purchase on their own sell order
const sellerUpdatePurchaseStatus = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use approved or rejected.' });
    }

    const purchase = await getPurchaseById(id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found.' });
    if (purchase.seller_id !== decoded.sub) {
      return res.status(403).json({ message: 'This purchase does not belong to your sell order.' });
    }
    if (purchase.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending purchases can be updated.' });
    }

    if (status === 'approved') {
      await createTransfer({
        sender_id: purchase.seller_id,
        receiver_id: purchase.buyer_id,
        amount: Number(purchase.amount),
        note: `Marketplace purchase #${purchase.id} (Order #${purchase.sell_order_id}) - Seller approved`,
      });
    }

    if (status === 'rejected') {
      await restoreSellOrderAmount(purchase.sell_order_id, Number(purchase.amount));
    }

    const updated = await updatePurchaseStatus(id, status, admin_note);
    await checkAndCompleteSellOrder(purchase.sell_order_id);

    res.json({ purchase: updated, message: `Purchase ${status} successfully.` });
  } catch (error) {
    console.error('Seller update purchase error:', error);
    res.status(500).json({ message: 'Failed to update purchase.' });
  }
};

// Admin: cancel a sell order
const adminUpdateStatus = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!['cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Only cancellation is allowed for sell orders.' });
    }

    const order = await getSellOrderById(id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (order.status === 'completed') {
      return res.status(400).json({ message: 'Cannot modify a completed order.' });
    }

    const updated = await updateSellOrderStatus(id, status, admin_note);
    res.json({ order: updated, message: 'Order cancelled successfully.' });
  } catch (error) {
    console.error('Admin update order error:', error);
    res.status(500).json({ message: 'Failed to update order.' });
  }
};

module.exports = { createOrder, myOrders, marketplace, buyOrder, myPurchases, sellerUpdatePurchaseStatus, adminListAll, adminUpdatePurchaseStatus, adminUpdateStatus };
