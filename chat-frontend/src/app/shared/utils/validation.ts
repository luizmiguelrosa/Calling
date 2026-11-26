/** Mirrors the backend DTO constraints so a field fails before the request. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 64;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/**
 * A pragmatic email shape check: one `@`, a non-empty local part, and a domain
 * with a dot. It is intentionally not RFC 5322 — the backend validator and the
 * real mailbox are the authority; this only catches obvious typos.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) {
    return 'Informe o e-mail.';
  }
  if (email.length > EMAIL_MAX_LENGTH) {
    return `O e-mail não pode passar de ${EMAIL_MAX_LENGTH} caracteres.`;
  }
  if (!EMAIL_PATTERN.test(email)) {
    return 'Informe um e-mail válido (ex.: nome@dominio.com).';
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) {
    return 'Informe a senha.';
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `A senha não pode passar de ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return null;
}

export function validateUsername(value: string): string | null {
  const username = value.trim();
  if (!username) {
    return 'Informe o nome de usuário.';
  }
  if (username.length < USERNAME_MIN_LENGTH) {
    return `O usuário precisa ter ao menos ${USERNAME_MIN_LENGTH} caracteres.`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `O usuário não pode passar de ${USERNAME_MAX_LENGTH} caracteres.`;
  }
  return null;
}

export function validateName(value: string): string | null {
  const name = value.trim();
  if (!name) {
    return 'Informe o nome.';
  }
  if (name.length < NAME_MIN_LENGTH) {
    return `O nome precisa ter ao menos ${NAME_MIN_LENGTH} caracteres.`;
  }
  if (name.length > NAME_MAX_LENGTH) {
    return `O nome não pode passar de ${NAME_MAX_LENGTH} caracteres.`;
  }
  return null;
}