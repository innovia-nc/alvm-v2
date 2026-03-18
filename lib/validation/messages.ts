export const validationMessages = {
  required: 'Ce champ est requis',
  email: 'Adresse email invalide',
  minLength: (min: number) => `Minimum ${min} caracteres`,
  maxLength: (max: number) => `Maximum ${max} caracteres`,
  uuid: 'Identifiant invalide',
  date: 'Date invalide',
  phone: 'Numero de telephone invalide',
  postalCode: 'Code postal invalide (5 chiffres)',
  password: {
    min: 'Minimum 8 caracteres',
    uppercase: 'Au moins une majuscule',
    lowercase: 'Au moins une minuscule',
    digit: 'Au moins un chiffre',
  },
} as const;
