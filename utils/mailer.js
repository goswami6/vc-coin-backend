const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const sendWelcomeEmail = async (to, name) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin:0;padding:0;background-color:#1a1225;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1225;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background-color:#221a30;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.05);">
              
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#5EFC8D,#8EF9F3);padding:30px;text-align:center;">
                  <h1 style="margin:0;font-size:28px;font-weight:900;color:#1a1225;letter-spacing:-0.5px;">VC Coin</h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:40px 36px;">
                  <h2 style="margin:0 0 8px;font-size:22px;color:#ffffff;font-weight:700;">Welcome to VC Coin, ${name}! 🎉</h2>
                  <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.5);line-height:1.7;">
                    Your account has been successfully created. You're now part of the VC Coin community — the future of smart investing.
                  </p>

                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                    <tr>
                      <td style="background:rgba(94,252,141,0.08);border:1px solid rgba(94,252,141,0.15);border-radius:12px;padding:20px;">
                        <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#5EFC8D;">Here's what you can do next:</p>
                        <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.6);">✅ Complete your profile</p>
                        <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.6);">✅ Make your first deposit</p>
                        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.6);">✅ Start investing with just 1000 VC</p>
                      </td>
                    </tr>
                  </table>

                  <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                    <tr>
                      <td style="background:linear-gradient(135deg,#5EFC8D,#8EF9F3);border-radius:10px;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard"
                           style="display:inline-block;padding:14px 36px;font-size:14px;font-weight:800;color:#1a1225;text-decoration:none;">
                          Go to Dashboard →
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:24px 36px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
                  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);line-height:1.6;">
                    You received this email because you registered on VC Coin.<br/>
                    © ${new Date().getFullYear()} VC Coin. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"VC Coin" <${process.env.SMTP_USER}>`,
    to,
    subject: `Welcome to VC Coin, ${name}!`,
    html,
  });
};

const sendOtpEmail = async (to, name, otp) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin:0;padding:0;background-color:#1a1225;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1225;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background-color:#221a30;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.05);">
              <tr>
                <td style="background:linear-gradient(135deg,#5EFC8D,#8EF9F3);padding:30px;text-align:center;">
                  <h1 style="margin:0;font-size:28px;font-weight:900;color:#1a1225;letter-spacing:-0.5px;">VC Coin</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 36px;">
                  <h2 style="margin:0 0 8px;font-size:22px;color:#ffffff;font-weight:700;">Password Reset Request</h2>
                  <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.5);line-height:1.7;">
                    Hi ${name}, we received a request to reset your password. Use the OTP below to verify your identity.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                    <tr>
                      <td align="center" style="background:rgba(94,252,141,0.08);border:1px solid rgba(94,252,141,0.15);border-radius:12px;padding:28px;">
                        <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;">Your OTP Code</p>
                        <p style="margin:0;font-size:36px;font-weight:900;color:#5EFC8D;letter-spacing:8px;">${otp}</p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.6;">
                    ⏱ This code is valid for <strong style="color:rgba(255,255,255,0.6);">10 minutes</strong>.
                  </p>
                  <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.6;">
                    If you didn't request this, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 36px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
                  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);line-height:1.6;">
                    © ${new Date().getFullYear()} VC Coin. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"VC Coin" <${process.env.SMTP_USER}>`,
    to,
    subject: 'VC Coin — Password Reset OTP',
    html,
  });
};

module.exports = { sendWelcomeEmail, sendOtpEmail };
