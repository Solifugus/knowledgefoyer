/**
 * Email Service for Knowledge Foyer
 *
 * Handles email sending using nodemailer with support for Ethereal Email (testing)
 * and production SMTP services
 */

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.testAccount = null;
  }

  /**
   * Initialize email service with SMTP configuration
   */
  async initialize() {
    try {
      if (process.env.NODE_ENV === 'development') {
        // For development, create Ethereal Email test account if needed
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
          console.log('📧 Creating Ethereal Email test account...');
          this.testAccount = await nodemailer.createTestAccount();

          this.transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
              user: this.testAccount.user,
              pass: this.testAccount.pass
            }
          });

          console.log('✅ Ethereal Email configured:');
          console.log(`📧 User: ${this.testAccount.user}`);
          console.log(`🔑 Pass: ${this.testAccount.pass}`);
          console.log('📬 Preview emails at: https://ethereal.email');
        } else {
          // Use provided SMTP credentials
          this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_PORT === '465',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            }
          });
        }
      } else {
        // Production SMTP configuration
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_PORT === '465',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
      }

      // Verify connection
      await this.transporter.verify();
      console.log('✅ Email service initialized successfully');

    } catch (error) {
      console.error('❌ Email service initialization failed:', error.message);
      // Don't throw error - allow app to continue without email
    }
  }

  /**
   * Send email
   */
  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      console.warn('Email service not initialized - email not sent');
      return { success: false, error: 'Email service not available' };
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@knowledgefoyer.test',
        to,
        subject,
        html,
        text: text || this.htmlToText(html)
      };

      const info = await this.transporter.sendMail(mailOptions);

      const result = {
        success: true,
        messageId: info.messageId
      };

      // Add preview URL for development
      if (process.env.NODE_ENV === 'development' && this.testAccount) {
        result.previewUrl = nodemailer.getTestMessageUrl(info);
        console.log('📧 Email sent! Preview: ' + result.previewUrl);
      }

      return result;

    } catch (error) {
      console.error('Email send error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(user, verificationToken) {
    const verificationUrl = `${process.env.BASE_URL}:${process.env.PORT}/api/auth/verify-email?token=${verificationToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>Verify Your Knowledge Foyer Account</title>
          <style>
              body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #2f5233; color: white; padding: 20px; text-align: center; }
              .content { background: #fafaf7; padding: 30px; }
              .button { display: inline-block; background: #c9a961; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; }
              .footer { text-align: center; color: #525252; font-size: 0.9em; padding: 20px; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Welcome to Knowledge Foyer!</h1>
              </div>
              <div class="content">
                  <h2>Hi ${user.display_name || user.username},</h2>
                  <p>Thank you for registering with Knowledge Foyer! To complete your account setup, please verify your email address.</p>

                  <p style="text-align: center; margin: 30px 0;">
                      <a href="${verificationUrl}" class="button">Verify Email Address</a>
                  </p>

                  <p>Or copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; background: #f0f0f0; padding: 10px;">${verificationUrl}</p>

                  <p><strong>Why verify?</strong> Email verification helps us:</p>
                  <ul>
                      <li>Keep your account secure</li>
                      <li>Send you important notifications</li>
                      <li>Help you reset your password if needed</li>
                  </ul>

                  <p>This verification link will expire in 24 hours for security reasons.</p>
              </div>
              <div class="footer">
                  <p>If you didn't create this account, you can safely ignore this email.</p>
                  <p>Knowledge Foyer - Professional Publishing Platform</p>
              </div>
          </div>
      </body>
      </html>
    `;

    return await this.sendEmail(
      user.email,
      'Verify Your Knowledge Foyer Account',
      html
    );
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.BASE_URL}:${process.env.PORT}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>Reset Your Knowledge Foyer Password</title>
          <style>
              body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #2f5233; color: white; padding: 20px; text-align: center; }
              .content { background: #fafaf7; padding: 30px; }
              .button { display: inline-block; background: #c9a961; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; }
              .footer { text-align: center; color: #525252; font-size: 0.9em; padding: 20px; }
              .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 4px; margin: 20px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Password Reset Request</h1>
              </div>
              <div class="content">
                  <h2>Hi ${user.display_name || user.username},</h2>
                  <p>We received a request to reset your Knowledge Foyer account password.</p>

                  <p style="text-align: center; margin: 30px 0;">
                      <a href="${resetUrl}" class="button">Reset Password</a>
                  </p>

                  <p>Or copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; background: #f0f0f0; padding: 10px;">${resetUrl}</p>

                  <div class="warning">
                      <strong>Security Notice:</strong> This reset link will expire in 1 hour for your security.
                      If you didn't request this password reset, you can safely ignore this email.
                  </div>
              </div>
              <div class="footer">
                  <p>Knowledge Foyer - Professional Publishing Platform</p>
              </div>
          </div>
      </body>
      </html>
    `;

    return await this.sendEmail(
      user.email,
      'Reset Your Knowledge Foyer Password',
      html
    );
  }

  /**
   * Simple HTML to text conversion
   */
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Get email service status
   */
  getStatus() {
    return {
      initialized: !!this.transporter,
      testMode: !!this.testAccount,
      testAccount: this.testAccount ? {
        user: this.testAccount.user,
        previewUrl: 'https://ethereal.email'
      } : null
    };
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;