// The message an administrator pastes into a chat or reads out. No email is sent by the system.
export const credentialsMessage = ({
  name,
  business,
  url,
  email,
  password,
}: {
  name: string;
  business: string;
  url: string;
  email: string;
  password: string;
}) =>
  [
    `Hi ${name}, here is your sign-in for ${business}.`,
    `Open: ${url}`,
    `Email: ${email}`,
    `One-time password: ${password}`,
    "You will be asked to choose your own password the first time you sign in.",
  ].join("\n");
