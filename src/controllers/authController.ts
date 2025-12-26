import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DataStore } from '../storage/DataStore';
import { User, Role } from '../models/User';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';

const dataStore = DataStore.getInstance();

export const register = async (req: Request, res: Response) => {
  try {
    const { username, password, role } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username and password are required'
        }
      });
    }

    // Check if user already exists
    const existingUser = dataStore.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        error: {
          code: 'USER_EXISTS',
          message: 'Username already taken'
        }
      });
    }

    // Create user
    const hashedPassword = await hashPassword(password);
    const newUser: User = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      role: role || Role.READER,
      createdAt: new Date()
    };

    dataStore.createUser(newUser);

    // Generate token
    const token = generateToken({
      id: newUser.id,
      username: newUser.username,
      role: newUser.role
    });

    res.status(201).json({
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role
      },
      token
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to register user'
      }
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username and password are required'
        }
      });
    }

    // Find user
    const user = dataStore.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      });
    }

    // Verify password
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      });
    }

    // Generate token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to login'
      }
    });
  }
};