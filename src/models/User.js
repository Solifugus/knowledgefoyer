/**
 * User Model for Knowledge Foyer
 *
 * Represents user accounts with authentication and profile information
 */

const { query, transaction } = require('../config/database');
const bcrypt = require('bcrypt');
const validator = require('validator');

class User {
  constructor(data) {
    this.id = data.id;
    this.username = data.username;
    this.email = data.email;
    this.display_name = data.display_name;
    this.bio = data.bio;
    this.avatar_url = data.avatar_url;
    this.password_hash = data.password_hash;
    this.email_verified = data.email_verified;
    this.email_verification_token = data.email_verification_token;
    this.password_reset_token = data.password_reset_token;
    this.password_reset_expires = data.password_reset_expires;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_login = data.last_login;
    this.is_active = data.is_active;
  }

  /**
   * Create a new user
   */
  static async create(userData) {
    const { username, email, password, display_name } = userData;

    // Validation
    if (!username || !email || !password) {
      throw new Error('Username, email, and password are required');
    }

    if (!validator.isEmail(email)) {
      throw new Error('Invalid email format');
    }

    if (!validator.isLength(username, { min: 3, max: 30 })) {
      throw new Error('Username must be 3-30 characters');
    }

    if (!validator.matches(username, /^[a-zA-Z0-9_-]+$/)) {
      throw new Error('Username can only contain letters, numbers, hyphens, and underscores');
    }

    if (!validator.isLength(password, { min: 8 })) {
      throw new Error('Password must be at least 8 characters');
    }

    // Check for existing username/email
    const existing = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username.toLowerCase(), email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      throw new Error('Username or email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Generate email verification token
    const email_verification_token = require('crypto').randomBytes(32).toString('hex');

    const result = await query(`
      INSERT INTO users (
        username, email, password_hash, display_name,
        email_verification_token
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      username.toLowerCase(),
      email.toLowerCase(),
      password_hash,
      display_name || username,
      email_verification_token
    ]);

    return new User(result.rows[0]);
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Find user by username
   */
  static async findByUsername(username) {
    const result = await query(
      'SELECT * FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Authenticate user with email/username and password
   */
  static async authenticate(identifier, password) {
    const isEmail = validator.isEmail(identifier);
    const field = isEmail ? 'email' : 'username';

    const result = await query(
      `SELECT * FROM users WHERE ${field} = $1 AND is_active = true`,
      [identifier.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = new User(result.rows[0]);
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return null;
    }

    // Update last login
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    return user;
  }

  /**
   * Update user profile
   */
  async updateProfile(updates) {
    const allowedFields = ['display_name', 'bio', 'avatar_url'];
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(this.id);
    const result = await query(`
      UPDATE users
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    // Update current instance
    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Change password
   */
  async changePassword(currentPassword, newPassword) {
    if (!await bcrypt.compare(currentPassword, this.password_hash)) {
      throw new Error('Current password is incorrect');
    }

    if (!validator.isLength(newPassword, { min: 8 })) {
      throw new Error('New password must be at least 8 characters');
    }

    const saltRounds = 12;
    const new_password_hash = await bcrypt.hash(newPassword, saltRounds);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [new_password_hash, this.id]
    );

    this.password_hash = new_password_hash;
    return this;
  }

  /**
   * Verify email address
   */
  async verifyEmail(token) {
    if (this.email_verification_token !== token) {
      throw new Error('Invalid verification token');
    }

    await query(`
      UPDATE users
      SET email_verified = true,
          email_verification_token = NULL,
          updated_at = NOW()
      WHERE id = $1
    `, [this.id]);

    this.email_verified = true;
    this.email_verification_token = null;
    return this;
  }

  /**
   * Generate password reset token
   */
  async generatePasswordResetToken() {
    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(`
      UPDATE users
      SET password_reset_token = $1,
          password_reset_expires = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [token, expires, this.id]);

    this.password_reset_token = token;
    this.password_reset_expires = expires;
    return token;
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token, newPassword) {
    if (!validator.isLength(newPassword, { min: 8 })) {
      throw new Error('Password must be at least 8 characters');
    }

    const result = await query(`
      SELECT * FROM users
      WHERE password_reset_token = $1
        AND password_reset_expires > NOW()
        AND is_active = true
    `, [token]);

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }

    const user = new User(result.rows[0]);
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(newPassword, saltRounds);

    await query(`
      UPDATE users
      SET password_hash = $1,
          password_reset_token = NULL,
          password_reset_expires = NULL,
          updated_at = NOW()
      WHERE id = $2
    `, [password_hash, user.id]);

    return user;
  }

  /**
   * Get public profile data (safe to return to clients)
   */
  toPublicJSON() {
    return {
      id: this.id,
      username: this.username,
      display_name: this.display_name,
      bio: this.bio,
      avatar_url: this.avatar_url,
      created_at: this.created_at,
    };
  }

  /**
   * Get authenticated user data (includes private fields)
   */
  toAuthJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      display_name: this.display_name,
      bio: this.bio,
      avatar_url: this.avatar_url,
      email_verified: this.email_verified,
      created_at: this.created_at,
      updated_at: this.updated_at,
      last_login: this.last_login,
    };
  }
}

module.exports = User;