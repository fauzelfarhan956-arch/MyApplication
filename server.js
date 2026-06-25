const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Where lead notifications land. Defaults to the existing inbox so behavior
// doesn't change unless you set ADMIN_EMAIL in .env.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'fauzel56@gmail.com';
const BUSINESS_PHONE = '+(230) 5858 0063';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Configure email transporter for Gmail
// FOR GMAIL SMTP (recommended for personal accounts):
// 1. Use your Gmail address as EMAIL_USER
// 2. Use an App Password (if your account has 2FA) as EMAIL_PASSWORD
// 3. For Google Workspace, ensure SMTP access is allowed for the mailbox

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }, 
    // Add a timeout fallback so it fails faster if there's a network issue
    connectionTimeout: 10000, 
    greetingTimeout: 10000
});

let emailStatus = {
    ok: false,
    lastChecked: null,
    message: 'Checking Gmail SMTP configuration...'
};

async function refreshEmailStatus() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        emailStatus = {
            ok: false,
            lastChecked: new Date().toISOString(),
            message: 'EMAIL_USER or EMAIL_PASSWORD is missing from .env.'
        };
        return;
    }

    try {
        await transporter.verify();
        emailStatus = {
            ok: true,
            lastChecked: new Date().toISOString(),
            message: 'Gmail SMTP is configured and ready.'
        };
        console.log('Gmail SMTP transporter is ready.');
    } catch (err) {
        emailStatus = {
            ok: false,
            lastChecked: new Date().toISOString(),
            message: `Email setup issue: ${err.message || err}`
        };
        console.warn('Gmail SMTP transporter verification failed. Check your .env credentials and network connection.', err.message || err);
    }
}

refreshEmailStatus();

// Alternative: Generic SMTP configuration
// const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: process.env.SMTP_PORT,
//     secure: true,
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASSWORD
//     }
// });

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

// Escape user input before it goes into HTML emails.
function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shared header used at the top of both emails. Table-based and inline-styled
// throughout this file on purpose — Outlook desktop's rendering engine
// ignores flexbox/grid/gradients/clip-path, so the brand look (void black +
// hazard yellow + mono "field label" chips) is rebuilt with the subset of
// CSS that actually survives across Gmail, Outlook, and Apple Mail.
function emailShell({ eyebrow, title, subtitle, bodyHtml, footerLines }) {
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f3ee; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f3ee;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0b0c0a; padding:36px 40px 30px;">
              <p style="margin:0 0 10px; font-family:'Courier New', Consolas, monospace; font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#ffc400;">${eyebrow}</p>
              <h1 style="margin:0; font-family: Arial, Helvetica, sans-serif; font-weight:900; font-size:26px; line-height:1.15; letter-spacing:0.4px; text-transform:uppercase; color:#ffffff;">${title}</h1>
              <p style="margin:10px 0 0; font-size:13px; color:#9aa19c;">${subtitle}</p>
            </td>
          </tr>

          <!-- Hazard bar -->
          <tr>
            <td style="background-color:#ffc400; height:6px; line-height:6px; font-size:0;">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#0b0c0a; padding:22px 40px; text-align:center;">
              ${footerLines}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function chip(text) {
    return `<span style="display:inline-block; background-color:#0b0c0a; color:#ffc400; font-family:'Courier New', Consolas, monospace; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; padding:6px 12px;">${escapeHtml(text)}</span>`;
}

function fieldRow(label, valueHtml, isLast) {
    const border = isLast ? '' : 'border-bottom:1px solid #eee;';
    return `
    <tr>
      <td style="padding:12px 0; ${border} font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#5b615c; width:35%; vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:12px 0; ${border} font-size:15px; color:#14171a; font-weight:600;">${valueHtml}</td>
    </tr>`;
}

// ---------------------------------------------------------------
// Routes
// ---------------------------------------------------------------

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint for form submission
app.post('/api/submit-quote', async (req, res) => {
    try {
        const service = (req.body.service || '').trim();
        const products = Array.isArray(req.body.products)
            ? req.body.products.map((item) => String(item).trim()).filter(Boolean)
            : req.body.products
                ? [String(req.body.products).trim()]
                : [];
        const priority = (req.body.priority || '').trim();
        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim();
        const fixedLine = (req.body.fixedLine || '').trim();
        const mobile = (req.body.mobile || '').trim();
        const phone = mobile || fixedLine || '';
        const address = (req.body.address || '').trim();
        const description = (req.body.description || '').trim();

        // Validate required fields
        if (!service || !name || !email || !address || !priority) {
            return res.status(400).json({
                message: 'Missing required fields'
            });
        }

        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({
                message: 'Please enter a valid email address'
            });
        }

        const fromAddress = process.env.EMAIL_USER || 'noreply@exterminators.com';
        const senderName = '"Exterminators Pest Control" <' + fromAddress + '>';
        const priorityColor = priority === 'High' ? '#d32f2f' : priority === 'Medium' ? '#f5a623' : '#219653';
        const priorityBadge = `<span style="display:inline-block; padding:6px 12px; border-radius:999px; background:${priorityColor}; color:#ffffff; font-size:12px; font-weight:700;">${escapeHtml(priority)}</span>`;
        const productsLabel = products.length ? escapeHtml(products.join(', ')) : 'No product selected';

        // ---- Email to admin ----
        const adminBody = `
            ${chip('Client File')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px; margin-bottom:28px;">
              ${fieldRow('Name', escapeHtml(name))}
              ${fieldRow('Email', `<a href="mailto:${escapeHtml(email)}" style="color:#14171a; text-decoration:none;">${escapeHtml(email)}</a>`)}
              ${fieldRow('Fixed Line', fixedLine ? `<a href="tel:${escapeHtml(fixedLine)}" style="color:#14171a; text-decoration:none;">${escapeHtml(fixedLine)}</a>` : 'Not provided') }
              ${fieldRow('Mobile', mobile ? `<a href="tel:${escapeHtml(mobile)}" style="color:#14171a; text-decoration:none;">${escapeHtml(mobile)}</a>` : 'Not provided')}
              ${fieldRow('Address', escapeHtml(address))}
              ${fieldRow('Priority', priorityBadge)}
              ${fieldRow('Products', productsLabel, true)}
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b0c0a; margin-bottom:${description ? '28px' : '24px'};">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 6px; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#ffc400;">Service Requested</p>
                  <p style="margin:0; font-family: Arial, Helvetica, sans-serif; font-weight:900; font-size:20px; letter-spacing:0.3px; text-transform:uppercase; color:#ffffff;">${escapeHtml(service)}</p>
                </td>
              </tr>
            </table>

            ${description ? `
            <p style="margin:0 0 8px; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#5b615c;">Field Notes</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f3ee; border-left:4px solid #ffc400; margin-bottom:28px;">
              <tr><td style="padding:16px 18px; font-size:14px; line-height:1.7; color:#14171a;">${escapeHtml(description).replace(/\n/g, '<br>')}</td></tr>
            </table>` : ''}

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff7da; border-left:4px solid #ffc400;">
              <tr>
                <td style="padding:18px 20px;">
                  <p style="margin:0; font-size:14px; font-weight:700; color:#0b0c0a;">Contact this customer within 24 hours with a complimentary estimate.</p>
                </td>
              </tr>
            </table>`;

        const adminMailOptions = {
            from: senderName,
            to: ADMIN_EMAIL,
            replyTo: email,
            subject: `New ${priority} Priority Quote Request \u2014 ${service} | Exterminators Pest Control`,
            text: `New ${priority} priority quote request via the website.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nPriority: ${priority}\nProducts: ${productsLabel}\nService: ${service}\n${description ? `Custom request: ${description}\n` : ''}\nContact this customer within 24 hours.`,
            html: emailShell({
                eyebrow: 'New Lead Alert',
                title: 'New Quote Request',
                subtitle: 'Exterminators Pest Control &middot; Field Intake',
                bodyHtml: adminBody,
                footerLines: `<p style="margin:0; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; color:#6c726c;">Exterminators Pest Control &middot; Automated Lead Notification</p>`
            })
        };

        // ---- Confirmation email to customer ----
        const customerBody = `
            <p style="margin:0 0 18px; font-size:15px; line-height:1.7; color:#14171a;">Hi <strong>${escapeHtml(name)}</strong>,</p>
            <p style="margin:0 0 18px; font-size:15px; line-height:1.7; color:#14171a;">Thank you for choosing Exterminators Pest Control. We've received your ${escapeHtml(priority.toLowerCase())} priority request for <strong>${escapeHtml(service)}</strong> and a technician will review it shortly.</p>
            <p style="margin:0 0 24px; font-size:15px; line-height:1.7; color:#14171a;">Your selected products: <strong>${productsLabel}</strong>.</p>

            ${chip('Request Summary')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f3ee; margin-top:14px; margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px 0; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#5b615c; width:40%;">Priority</td>
                <td style="padding:16px 20px 0; font-size:14px; font-weight:700; color:#14171a;">${escapeHtml(priority)}</td>
              </tr>
              <tr>
                <td style="padding:16px 20px 0; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#5b615c; width:40%;">Service Type</td>
                <td style="padding:16px 20px 0; font-size:14px; font-weight:700; color:#14171a;">${escapeHtml(service)}</td>
              </tr>
              <tr>
                <td style="padding:10px 20px 0; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#5b615c;">Products</td>
                <td style="padding:10px 20px 0; font-size:14px; font-weight:700; color:#14171a;">${productsLabel}</td>
              </tr>
              <tr>
                <td style="padding:10px 20px 0; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#5b615c;">Location</td>
                <td style="padding:10px 20px 0; font-size:14px; font-weight:700; color:#14171a;">${escapeHtml(address)}</td>
              </tr>
              <tr>
                <td style="padding:10px 20px 20px; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#5b615c;">Contact Number</td>
                <td style="padding:10px 20px 20px; font-size:14px; font-weight:700; color:#14171a;">${escapeHtml(phone || 'Not provided')}</td>
              </tr>
            </table>

            ${description ? `
            <p style="margin:0 0 8px; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#5b615c;">Custom Request</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f3ee; border-left:4px solid #219653; margin-bottom:24px;">
              <tr><td style="padding:16px 18px; font-size:14px; line-height:1.7; color:#14171a;">${escapeHtml(description).replace(/\n/g, '<br>')}</td></tr>
            </table>` : ''}

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e8f5ec; border-left:4px solid #1f7a3f; margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0; font-size:14px; font-weight:700; color:#1f7a3f;">&#10003; Expected response time: within 24 hours</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px; font-size:15px; line-height:1.7; color:#14171a;">Need to reach us sooner, or want to adjust any details? Call <strong>${BUSINESS_PHONE}</strong> or just reply to this email.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eee;">
              <tr>
                <td style="padding-top:24px;">
                  <p style="margin:0 0 4px; font-size:14px; color:#14171a;">Best regards,</p>
                  <p style="margin:0; font-size:14px; font-weight:700; color:#0b0c0a;">Exterminators Pest Control Team</p>
                  <p style="margin:8px 0 0; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#5b615c;">24/7 Emergency Service &middot; Same-Day Response Available</p>
                </td>
              </tr>
            </table>`;

        const customerMailOptions = {
            from: senderName,
            to: email,
            subject: `We've Got Your File \u2014 Your Free Pest Estimate | Exterminators`,
            text: `Hi ${name},\n\nThank you for choosing Exterminators Pest Control. We've received your estimate request for ${service} and will respond within 24 hours.\n\nService: ${service}\nLocation: ${address}\nContact Number: ${phone || 'Not provided'}\n\nQuestions? Call ${BUSINESS_PHONE} or reply to this email.\n\n— Exterminators Pest Control Team`,
            html: emailShell({
                eyebrow: 'Request Received',
                title: "We've Got Your File.",
                subtitle: 'Your Free Pest Control Estimate',
                bodyHtml: customerBody,
                footerLines: `
                    <p style="margin:0 0 4px; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; color:#6c726c;">&copy; 2026 Exterminators Pest Control. All rights reserved.</p>
                    <p style="margin:0; font-family:'Courier New', Consolas, monospace; font-size:11px; letter-spacing:1px; color:#ffc400;">Pests don't negotiate. Neither do we.</p>`
            })
        };

        // Send both emails. Use allSettled so a failed confirmation email
        // doesn't mask a successful lead notification (or vice versa).
        const [adminResult, customerResult] = await Promise.allSettled([
            transporter.sendMail(adminMailOptions),
            transporter.sendMail(customerMailOptions)
        ]);

        if (adminResult.status === 'rejected') {
            console.error('Admin notification email failed:', adminResult.reason);
            return res.status(500).json({
                message: 'Failed to submit quote request. Please try again later.'
            });
        }

        if (customerResult.status === 'rejected') {
            console.error('Customer confirmation email failed:', customerResult.reason);
            // The lead was still captured — don't block the user on this.
        }

        res.json({
            success: true,
            message: 'Request received. We\u2019ll be in touch within 24 hours.'
        });

    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({
            message: 'Failed to submit quote request. Please try again later.'
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running' });
});

// Email configuration status for frontend diagnostics
app.get('/api/email-status', (req, res) => {
    res.json(emailStatus);
});

// Handle 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({
        message: 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║   Exterminators Pest Control Server    ║
    ║   Running on http://localhost:${PORT}        ║
    ╚════════════════════════════════════════╝
    
    IMPORTANT - Email Configuration:
    To enable email functionality, create a .env file in the public folder with:
    
    EMAIL_USER=your-email@gmail.com
    EMAIL_PASSWORD=your-gmail-app-password
    ADMIN_EMAIL=where-leads-should-go@example.com
    PORT=3000
    
    For Gmail SMTP (recommended for personal accounts):
    Host: smtp.gmail.com
    Port: 587
    Security: STARTTLS
    
    If using Outlook/Office365:
    Host: smtp.office365.com
    Port: 587
    
    Quick test: curl http://localhost:${PORT}/api/health
    `);
});
