// What goes to LinkedIn for a ReplyFlow post. Pure, so it can be tested.

export const MAX_LENGTH = 3000;

// LinkedIn reads some characters in a post as formatting: ( ) [ ] { } < > @ | ~ _ * # and the backslash.
// Left alone they can cut the text short or turn into mentions, so each is escaped and shows as itself.
// The cost is that a #hashtag appears as plain text rather than a link.
export const escapeCommentary = (text: string) =>
  text.replace(/[\\()[\]{}<>@|~_*#]/g, (c) => `\\${c}`);

export const commentaryFor = (message: string, link: string | null) => {
  const text = [message.trim(), link?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
  return escapeCommentary(text);
};

export const tooLong = (message: string, link: string | null) =>
  [message.trim(), link?.trim() ?? ""].filter(Boolean).join("\n\n").length >
  MAX_LENGTH;

export const postBody = (
  memberId: string,
  message: string,
  link: string | null,
) => ({
  author: `urn:li:person:${memberId}`,
  commentary: commentaryFor(message, link),
  visibility: "PUBLIC",
  distribution: {
    feedDistribution: "MAIN_FEED",
    targetEntities: [],
    thirdPartyDistributionChannels: [],
  },
  lifecycleState: "PUBLISHED",
  isReshareDisabledByAuthor: false,
});
