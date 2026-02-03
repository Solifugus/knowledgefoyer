/**
 * Authentication Routes for Knowledge Foyer
 *
 * Handles user registration, login, password reset, and email verification
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authMiddleware, generateToken, generateRefreshToken } = require('../middleware/auth');
const { createValidationError, createAuthError } = require('../middleware/errorHandlers');
const User = require('../models/User');
const emailService = require('../services/EmailService');

const router = express.Router();

// Rate limiting for auth endpoints (generous for development)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 5, // 100 attempts in dev, 5 in production
  message: {
    error: 'Too many authentication attempts, please try again later.',
  },
});

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { username, email, password, display_name } = req.body;

    if (!username || !email || !password) {
      throw createValidationError('Username, email, and password are required');
    }

    const user = await User.create({
      username,
      email,
      password,
      display_name
    });

    // Send verification email
    try {
      const emailResult = await emailService.sendVerificationEmail(user, user.email_verification_token);
      if (emailResult.success) {
        console.log(`📧 Verification email sent to ${user.email}`);
        if (emailResult.previewUrl) {
          console.log(`📬 Preview: ${emailResult.previewUrl}`);
        }
      } else {
        console.warn(`⚠️  Failed to send verification email to ${user.email}: ${emailResult.error}`);
      }
    } catch (emailError) {
      console.error('Email sending error:', emailError.message);
      // Don't fail registration if email fails
    }

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(201).json({
      message: 'User registered successfully',
      user: user.toAuthJSON(),
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: process.env.JWT_ACCESS_EXPIRY || '15m'
      },
      next_steps: [
        'Check your email for a verification link to enable all features',
        'Complete your profile to improve discoverability'
      ]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      throw createValidationError('Email/username and password are required');
    }

    const user = await User.authenticate(identifier, password);

    if (!user) {
      throw createAuthError('Invalid credentials');
    }

    if (!user.is_active) {
      throw createAuthError('Account is deactivated');
    }

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      message: 'Login successful',
      user: user.toAuthJSON(),
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: process.env.JWT_ACCESS_EXPIRY || '15m'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    // In a production app, you'd typically blacklist the token
    // For now, we rely on client-side token removal
    res.json({
      message: 'Logged out successfully',
      instruction: 'Please remove tokens from client storage'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      throw createAuthError('User not found');
    }

    res.json({
      user: user.toAuthJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      throw createAuthError('User not found');
    }

    const { display_name, bio, avatar_url } = req.body;
    const updates = {};

    if (display_name !== undefined) updates.display_name = display_name;
    if (bio !== undefined) updates.bio = bio;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      throw createValidationError('No valid fields provided for update');
    }

    await user.updateProfile(updates);

    res.json({
      message: 'Profile updated successfully',
      user: user.toAuthJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      throw createValidationError('Current password and new password are required');
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      throw createAuthError('User not found');
    }

    await user.changePassword(current_password, new_password);

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/verify-email
 * Verify email address with token (for email links)
 */
router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Email Verification - Knowledge Foyer</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1 style="color: #d32f2f;">Invalid Verification Link</h1>
          <p>The verification link is missing or invalid. Please check your email for the correct link.</p>
          <a href="/">← Return to Knowledge Foyer</a>
        </body>
        </html>
      `);
    }

    // Find user by verification token
    const { query } = require('../config/database');
    const userResult = await query(
      'SELECT * FROM users WHERE email_verification_token = $1 AND email_verified = false',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Email Verification - Knowledge Foyer</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1 style="color: #d32f2f;">Invalid or Expired Token</h1>
          <p>This verification link is invalid or has already been used.</p>
          <a href="/login">← Login to Knowledge Foyer</a>
        </body>
        </html>
      `);
    }

    const user = new User(userResult.rows[0]);
    await user.verifyEmail(token);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Email Verified - Knowledge Foyer</title></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center;">
        <h1 style="color: #2e7d32;">✅ Email Verified Successfully!</h1>
        <p>Welcome to Knowledge Foyer, ${user.display_name || user.username}!</p>
        <p>Your email has been verified and your account is now fully active.</p>
        <a href="/login" style="background: #2f5233; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Continue to Login</a>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error - Knowledge Foyer</title></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
        <h1 style="color: #d32f2f;">Verification Error</h1>
        <p>There was an error verifying your email. Please try again or contact support.</p>
        <a href="/">← Return to Knowledge Foyer</a>
      </body>
      </html>
    `);
  }
});

/**
 * POST /api/auth/verify-email
 * Verify email address with token (API endpoint)
 */
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token, user_id } = req.body;

    if (!token || !user_id) {
      throw createValidationError('Token and user ID are required');
    }

    const user = await User.findById(user_id);

    if (!user) {
      throw createValidationError('User not found');
    }

    if (user.email_verified) {
      return res.json({
        message: 'Email already verified'
      });
    }

    await user.verifyEmail(token);

    res.json({
      message: 'Email verified successfully',
      user: user.toAuthJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/request-password-reset
 * Request password reset token
 */
router.post('/request-password-reset', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw createValidationError('Email is required');
    }

    const user = await User.findByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    const resetToken = await user.generatePasswordResetToken();

    // In a real application, you would send an email here
    console.log(`Password reset token for ${user.email}: ${resetToken}`);

    res.json({
      message: 'If an account with that email exists, a password reset link has been sent.',
      // In development, include token in response
      ...(process.env.NODE_ENV === 'development' && { dev_reset_token: resetToken })
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      throw createValidationError('Token and new password are required');
    }

    const user = await User.resetPassword(token, new_password);

    res.json({
      message: 'Password reset successfully',
      user: user.toPublicJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      throw createValidationError('Refresh token is required');
    }

    const jwt = require('jsonwebtoken');

    try {
      const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);

      if (decoded.type !== 'refresh') {
        throw createAuthError('Invalid token type');
      }

      const user = await User.findById(decoded.id);

      if (!user || !user.is_active) {
        throw createAuthError('User not found or inactive');
      }

      // Generate new access token
      const accessToken = generateToken(user);

      res.json({
        message: 'Token refreshed successfully',
        tokens: {
          access_token: accessToken,
          expires_in: process.env.JWT_ACCESS_EXPIRY || '15m'
        }
      });
    } catch (jwtError) {
      throw createAuthError('Invalid refresh token');
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;