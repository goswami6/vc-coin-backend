const jwt = require('jsonwebtoken');
const {
  createSellOrder,
  getSellOrderById,
  getSellOrdersByUser,
  getApprovedOrders,
  getAllSellOrders,
  updateSellOrderStatus,
  completeSellOrder,
  claimSellOrder,
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

// User: create a sell order
const createOrder = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { amount, price_per_vc, seller_upi } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Enter a valid VC amount.' });
    }
    if (Number(amount) < 10) {
      return res.status(400).json({ message: 'Minimum sell amount is 10 VC.' });
    }
    if (!price_per_vc || Number(price_per_vc) <= 0) {
      return res.status(400).json({ message: 'Enter a valid price per VC.' });
    }
    if (!seller_upi || !seller_upi.trim()) {
      return res.status(400).json({ message: 'Enter your UPI ID.' });
    }

    // Check available balance (centralized and non-negative)
    const { available } = await getAvailableBalance(decoded.sub);
    const needed = Number(amount) * 1.05; // amount + 5% fee

    if (available < needed) {
      return res.status(400).json({
        message: `Insufficient balance. You need ${needed.toFixed(2)} VC (${Number(amount).toFixed(2)} + 5% fee). Available: ${Math.max(0, available).toFixed(2)} VC.`,
      });
    }

    const order = await createSellOrder({
      seller_id: decoded.sub,
      amount: Number(amount),
      price_per_vc: Number(price_per_vc),
      seller_upi: seller_upi.trim(),
    });

    res.status(201).json({ order, message: 'Sell order submitted! Waiting for admin approval.' });
  } catch (error) {
    console.error('Create sell order error:', error);
    res.status(500).json({ message: 'Failed to create sell order.' });
  }
};

// User: my sell orders
const myOrders = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const orders = await getSellOrdersByUser(decoded.sub);
    const { marketLocked: locked } = await getAvailableBalance(decoded.sub);
    res.json({ orders, lockedBalance: locked });
  } catch (error) {
    console.error('My sell orders error:', error);
    res.status(500).json({ message: 'Failed to fetch sell orders.' });
  }
};

// User: browse marketplace (approved orders)
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

// User: buy from an approved sell order (upload payment proof screenshot)
const buyOrder = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const order = await getSellOrderById(id);

    if (!order) {
      return res.status(404).json({ message: 'Sell order not found.' });
    }
    if (order.status !== 'approved') {
      return res.status(400).json({ message: 'This order is no longer available.' });
    }
    if (order.seller_id === decoded.sub) {
      return res.status(400).json({ message: 'You cannot buy your own order.' });
    }

    const payment_proof = req.file ? req.file.filename : null;
    if (!payment_proof) {
      return res.status(400).json({ message: 'Please upload payment screenshot.' });
    }

    // Claim the order - mark as purchased, set buyer_id and payment proof
    await claimSellOrder(order.id, decoded.sub, payment_proof);

    res.json({
      message: `Payment proof submitted! Admin will verify and ${Number(order.amount).toFixed(2)} VC will be added to your wallet.`,
    });
  } catch (error) {
    console.error('Buy order error:', error);
    res.status(500).json({ message: 'Purchase failed.' });
  }
};

// Admin: list all sell orders
const adminListAll = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const orders = await getAllSellOrders();

    // Stats
    let pending = 0, approved = 0, purchased = 0, completed = 0, cancelled = 0, rejected = 0;
    let totalVolume = 0, totalFees = 0, totalRevenue = 0;
    orders.forEach((o) => {
      if (o.status === 'pending') pending++;
      else if (o.status === 'approved') approved++;
      else if (o.status === 'purchased') purchased++;
      else if (o.status === 'completed') {
        completed++;
        totalVolume += Number(o.amount);
        totalFees += Number(o.fee_amount);
        totalRevenue += Number(o.total_price);
      } else if (o.status === 'cancelled') cancelled++;
      else if (o.status === 'rejected') rejected++;
    });

    res.json({
      orders,
      stats: { pending, approved, purchased, completed, cancelled, rejected, totalVolume, totalFees, totalRevenue },
    });
  } catch (error) {
    console.error('Admin marketplace error:', error);
    res.status(500).json({ message: 'Failed to fetch marketplace data.' });
  }
};

// Admin: approve / reject / cancel / complete a sell order
const adminUpdateStatus = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!['approved', 'rejected', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    const order = await getSellOrderById(id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.status === 'completed') {
      return res.status(400).json({ message: 'Cannot modify a completed order.' });
    }

    // If completing: verify buyer exists and execute VC transfer
    if (status === 'completed') {
      if (!order.buyer_id) {
        return res.status(400).json({ message: 'No buyer assigned. Order must be purchased first.' });
      }
      // Transfer full amount VC from seller to buyer (fee is deducted from seller separately)
      await createTransfer({
        sender_id: order.seller_id,
        receiver_id: order.buyer_id,
        amount: Number(order.amount),
        note: `Marketplace purchase - Order #${order.id}`,
      });
    }

    const updated = await updateSellOrderStatus(id, status, admin_note);
    res.json({ order: updated, message: `Order ${status} successfully.` });
  } catch (error) {
    console.error('Admin update order error:', error);
    res.status(500).json({ message: 'Failed to update order.' });
  }
};

module.exports = { createOrder, myOrders, marketplace, buyOrder, adminListAll, adminUpdateStatus };
