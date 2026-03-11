require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.titan.email',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  debug: true,
  logger: true,
});

console.log('SMTP Config:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
});

console.log('\nVerifying SMTP connection...');
transporter.verify()
  .then(() => {
    console.log('SMTP connection OK! Sending test email...');
    return transporter.sendMail({
      from: `"VC Coin" <${process.env.SMTP_USER}>`,
      to: 'akankshagoswami567@gmail.com',
      subject: 'VC Coin - SMTP Test',
      text: 'If you see this, SMTP is working!',
    });
  })
  .then((info) => {
    console.log('\nEmail sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  })
  .catch((err) => {
    console.error('\nSMTP ERROR:', err.message);
    console.error('Full error:', err);
  });
