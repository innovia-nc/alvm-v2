export const validationMessages = {
  required: 'Ce champ est requis',
  email: 'Adresse email invalide',
  minLength: (min: number) => `Minimum ${min} caractères`,
  maxLength: (max: number) => `Maximum ${max} caractères`,
  uuid: 'Identifiant invalide',
  date: 'Date invalide',
  phone: 'Numéro de téléphone invalide',
  postalCode: 'Code postal invalide (5 chiffres)',
  password: {
    min: 'Minimum 8 caractères',
    uppercase: 'Au moins une majuscule',
    lowercase: 'Au moins une minuscule',
    digit: 'Au moins un chiffre',
  },
} as const;
