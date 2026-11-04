export const MIN_PASSWORD_LENGTH = 10;

// What is wrong with a new password, or null. Pure, so it can be tested.
export const passwordProblem = (
  password: string,
  confirm: string,
): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
};
