const jwt = require('jsonwebtoken');
const {
  createTicket,
  getTicketsByUser,
  getAllTickets,
  getMessages,
  addMessage,
  getTicketById,
  updateTicketStatus,
} = require('../models/supportModel');

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

// User: create a new support ticket
const create = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and message are required.' });
    }
    if (subject.length > 255) {
      return res.status(400).json({ message: 'Subject too long (max 255 chars).' });
    }

    const ticket = await createTicket(decoded.sub, subject.trim(), message.trim());
    res.status(201).json({ ticket, message: 'Ticket created successfully.' });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ message: 'Failed to create ticket.' });
  }
};

// User: list my tickets
const myTickets = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const tickets = await getTicketsByUser(decoded.sub);
    res.json({ tickets });
  } catch (error) {
    console.error('My tickets error:', error);
    res.status(500).json({ message: 'Failed to fetch tickets.' });
  }
};

// Admin: list all tickets
const listAll = async (req, res) => {
  try {
    const tickets = await getAllTickets();
    res.json({ tickets });
  } catch (error) {
    console.error('List tickets error:', error);
    res.status(500).json({ message: 'Failed to fetch tickets.' });
  }
};

// User/Admin: get messages for a ticket
const messages = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const ticket = await getTicketById(id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

    // Only allow owner or admin
    if (ticket.user_id !== decoded.sub && decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const msgs = await getMessages(id);
    res.json({ ticket, messages: msgs });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Failed to fetch messages.' });
  }
};

// User/Admin: send a message
const sendMessage = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required.' });
    }

    const ticket = await getTicketById(id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

    // Only allow owner or admin
    if (ticket.user_id !== decoded.sub && decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({ message: 'This ticket is closed.' });
    }

    const role = decoded.user_type === 'admin' ? 'admin' : 'user';
    // Reopen if resolved and user replies
    if (role === 'user' && ticket.status === 'resolved') {
      await updateTicketStatus(id, 'open');
    }

    const msg = await addMessage(id, role, decoded.sub, message.trim());
    res.status(201).json({ message: msg });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message.' });
  }
};

// Admin: update ticket status
const changeStatus = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') return res.status(403).json({ message: 'Admin only.' });

    const { id } = req.params;
    const { status } = req.body;
    if (!['open', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    await updateTicketStatus(id, status);
    res.json({ message: `Ticket ${status}.` });
  } catch (error) {
    console.error('Change status error:', error);
    res.status(500).json({ message: 'Failed to update status.' });
  }
};

module.exports = { create, myTickets, listAll, messages, sendMessage, changeStatus };
