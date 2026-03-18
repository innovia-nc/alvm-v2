import { z } from 'zod';

export const uuidSchema = z.string().uuid('UUID invalide');

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)');

export const firstNameSchema = z.string().min(2, 'Minimum 2 caracteres').max(50, 'Maximum 50 caracteres');
export const lastNameSchema = z.string().min(2, 'Minimum 2 caracteres').max(50, 'Maximum 50 caracteres');

export const phoneSchema = z.string().min(6, 'Numero de telephone invalide').max(20);
export const emailSchema = z.string().email('Adresse email invalide');

export const postalCodeSchema = z.string().regex(/^\d{5}$/, 'Code postal invalide (5 chiffres)');
export const addressSchema = z.string().min(5, 'Adresse trop courte').max(200);
export const citySchema = z.string().min(2, 'Ville trop courte').max(100);
