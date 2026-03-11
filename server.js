require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const planRoutes = require('./routes/planRoutes');
const depositRoutes = require('./routes/depositRoutes');
const investmentRoutes = require('./routes/investmentRoutes');
const transferRoutes = require('./routes/transferRoutes');
const marketplaceRoutes = require('./routes/marketplaceRoutes');
const withdrawRoutes = require('./routes/withdrawRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const referralRoutes = require('./routes/referralRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const contactRoutes = require('./routes/contactRoutes');

const { autoRenewInvestments } = require('./models/investmentModel');
const { creditLevelIncome } = require('./models/levelIncomeModel');

const app = express();

app.use(cors());
app.use(compression());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'VC Coin backend is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/withdrawals', withdrawRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/reports', reportRoutes);
app.use('/api/admin/notifications', notificationRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/contact', contactRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);

  // Auto-renewal scheduler: runs every hour
  const runAutoRenewal = async () => {
    try {
      const renewed = await autoRenewInvestments();
      if (renewed.length > 0) {
        console.log(`Auto-renewed ${renewed.length} investment(s)`);
        for (const r of renewed) {
          creditLevelIncome(r.user_id, r.amount, r.id).catch((err) =>
            console.error('Level income credit error (auto-renewal):', err)
          );
        }
      }
    } catch (err) {
      console.error('Auto-renewal scheduler error:', err);
    }
  };
  // Run once on startup, then every hour
  runAutoRenewal();
  setInterval(runAutoRenewal, 60 * 60 * 1000);
});
