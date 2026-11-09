// The parts of reading a company Page's activity that need no network. Pure, so they can be tested.

const BASE = "https://api.linkedin.com/rest";
export const orgUrn = (orgId: string) => `urn:li:organization:${orgId}`;
const enc = encodeURIComponent;

// LinkedIn wants each urn percent-encoded where it sits in an address.
export const postsUrl = (orgId: string) =>
  `${BASE}/posts?q=author&author=${enc(orgUrn(orgId))}&count=20&sortBy=LAST_MODIFIED`;
export const commentsUrl = (postUrn: string) =>
  `${BASE}/socialActions/${enc(postUrn)}/comments?count=50`;
export const replyUrl = (postUrn: string) =>
  `${BASE}/socialActions/${enc(postUrn)}/comments`;
export const followersUrl = (orgId: string) =>
  `${BASE}/networkSizes/${enc(orgUrn(orgId))}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`;
export const shareStatsUrl = (orgId: string) =>
  `${BASE}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc(orgUrn(orgId))}`;

// Only urns of the shapes LinkedIn uses for posts, so nothing odd is placed in an address.
export const validPostUrn = (urn: unknown): urn is string =>
  typeof urn === "string" &&
  /^urn:li:(share|ugcPost|activity):\d{1,25}$/.test(urn);
export const validCommentUrn = (urn: unknown): urn is string =>
  typeof urn === "string" &&
  /^urn:li:comment:\(urn:li:(share|ugcPost|activity):\d{1,25},\d{1,25}\)$/.test(
    urn,
  );

export type Post = { urn: string; text: string; publishedAt: number | null };

export const parsePosts = (json: {
  elements?: Record<string, unknown>[];
}): Post[] =>
  (json.elements ?? [])
    .map((e) => ({
      urn: String(e.id ?? ""),
      text: String(e.commentary ?? "").slice(0, 600),
      publishedAt:
        typeof e.publishedAt === "number"
          ? e.publishedAt
          : typeof e.createdAt === "number"
            ? e.createdAt
            : null,
    }))
    .filter((p) => validPostUrn(p.urn));

export type Comment = {
  urn: string;
  text: string;
  at: number | null;
  fromPage: boolean;
  actor: string;
  // The commenter's LinkedIn member id, when the commenter is a person (not a Page).
  personId: string | null;
};

// LinkedIn gives the commenter as an urn, not a name; names need a separate permission, so a member is
// shown as "A LinkedIn member" and the Page's own replies as the Page.
export const parseComments = (
  json: { elements?: Record<string, unknown>[] },
  orgId: string,
): Comment[] =>
  (json.elements ?? [])
    .map((e) => {
      const actor = String(e.actor ?? "");
      const message = e.message as { text?: unknown } | undefined;
      const created = e.created as { time?: unknown } | undefined;
      return {
        urn: String(e["$URN"] ?? e.commentUrn ?? ""),
        text: String(message?.text ?? "").slice(0, 2000),
        at: typeof created?.time === "number" ? created.time : null,
        fromPage: actor === orgUrn(orgId),
        actor,
        personId:
          /^urn:li:person:([A-Za-z0-9_-]{1,40})$/.exec(actor)?.[1] ?? null,
      };
    })
    .filter((c) => validCommentUrn(c.urn))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

export const replyBody = (
  orgId: string,
  postUrn: string,
  text: string,
  parentComment?: string | null,
) => ({
  actor: orgUrn(orgId),
  object: postUrn,
  message: { text },
  ...(parentComment ? { parentComment } : {}),
});

export const MAX_REPLY = 1250;
export const validReply = (text: unknown): text is string =>
  typeof text === "string" &&
  text.trim().length > 0 &&
  text.trim().length <= MAX_REPLY;

export type Stats = {
  impressions: number;
  clicks: number;
  reactions: number;
  comments: number;
  shares: number;
  engagementRate: number | null; // as a fraction
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// All-time totals across the Page's posts.
export const parseShareStats = (json: {
  elements?: { totalShareStatistics?: Record<string, unknown> }[];
}): Stats => {
  const t = json.elements?.[0]?.totalShareStatistics ?? {};
  const impressions = num(t.impressionCount);
  const clicks = num(t.clickCount);
  const reactions = num(t.likeCount);
  const comments = num(t.commentCount);
  const shares = num(t.shareCount);
  return {
    impressions,
    clicks,
    reactions,
    comments,
    shares,
    engagementRate:
      typeof t.engagement === "number"
        ? t.engagement
        : impressions > 0
          ? (clicks + reactions + comments + shares) / impressions
          : null,
  };
};

export const parseFollowers = (json: { firstDegreeSize?: unknown }) =>
  num(json.firstDegreeSize);

// ---- Commenters' names -------------------------------------------------------------------------------
// LinkedIn gives a commenter as an id. A name needs a lookup, which LinkedIn may refuse for some members,
// so a name is shown when it is returned and "A LinkedIn member" when it is not.

export const personIds = (comments: Comment[]) => [
  ...new Set(
    comments.map((c) => c.personId).filter((id): id is string => !!id),
  ),
];

export const MAX_LOOKUPS = 50;

export const peopleUrl = (ids: string[]) =>
  `${BASE}/people?ids=List(${ids
    .slice(0, MAX_LOOKUPS)
    .map((id) => `(id:${enc(id)})`)
    .join(",")})`;

export type Person = { name: string; url: string | null };

const text = (v: unknown) => String(v ?? "").trim();
const localised = (v: unknown) => {
  const o = v as { localized?: Record<string, unknown> } | undefined;
  return text(Object.values(o?.localized ?? {})[0]);
};

// LinkedIn answers a batch lookup with a "results" object keyed by "(id:abc)". Anything missing or odd is left
// out, so a partial answer still names the people it can.
export const parsePeople = (json: {
  results?: Record<string, Record<string, unknown>>;
}): Record<string, Person> => {
  const people: Record<string, Person> = {};
  for (const [key, value] of Object.entries(json.results ?? {})) {
    const id = /id:([^,)]+)/.exec(decodeURIComponent(key))?.[1];
    if (!id) continue;
    const name =
      [text(value.localizedFirstName), text(value.localizedLastName)]
        .filter(Boolean)
        .join(" ") ||
      [localised(value.firstName), localised(value.lastName)]
        .filter(Boolean)
        .join(" ");
    if (!name) continue;
    const vanity = text(value.vanityName);
    people[id] = {
      name: name.slice(0, 120),
      url: /^[A-Za-z0-9_%-]{1,100}$/.test(vanity)
        ? `https://www.linkedin.com/in/${vanity}`
        : null,
    };
  }
  return people;
};
