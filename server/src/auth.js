import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { query } from "./db.js";

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: "7d" },
  );
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ message: "Token tidak ditemukan." });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await query(
      "select id, name, email, role, phone, status from users where id = $1 and status = 'active'",
      [payload.id],
    );

    if (!user.rows[0]) {
      return res.status(401).json({ message: "Pengguna tidak aktif." });
    }

    req.user = user.rows[0];
    next();
  } catch {
    return res.status(401).json({ message: "Token tidak valid." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Akses tidak diizinkan." });
    }

    next();
  };
}
