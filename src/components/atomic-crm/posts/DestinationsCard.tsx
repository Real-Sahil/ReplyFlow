import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { ChannelRow } from "./ChannelRow";
import { rememberedChoice } from "./destinationActions";
import { LinkedInWording } from "./LinkedInWording";
import {
  platformOf,
  wordingFrom,
  type Channel,
  type DestinationRow,
  type Wording,
} from "./destinations";
import { useChannels, useDestinations } from "./useDestinations";

const Group = ({
  title,
  channels,
  rows,
  picked,
  onToggle,
  locked,
  empty,
}: {
  title: string;
  channels: Channel[];
  rows: DestinationRow[];
  picked: Set<string>;
  onToggle: (key: string, on: boolean) => void;
  locked: boolean;
  empty: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
    {channels.length ? (
      <ul className="divide-y rounded-lg border">
        {channels.map((channel) => (
          <ChannelRow
            key={channel.channel_key}
            channel={channel}
            row={rows.find((r) => r.channel_key === channel.channel_key)}
            checked={picked.has(channel.channel_key)}
            onCheck={(on) => onToggle(channel.channel_key, on)}
            locked={locked}
          />
        ))}
      </ul>
    ) : (
      <p className="text-xs text-muted-foreground">{empty}</p>
    )}
  </div>
);

// The "Where it goes" part of the post editor: every Facebook Page and LinkedIn account the business has
// connected, as tick boxes with where each one stands, and one choice of wording for the LinkedIn ones. A post
// can go to any mix, including LinkedIn only. It starts from what the post already has saved; a new post starts
// from the channels last used, or the default Facebook Page.
export const DestinationsCard = ({
  postId,
  legacyPageId,
  picked,
  onPicked,
  wording,
  onWording,
  message,
  productId,
  readOnly,
  wordingLocked,
}: {
  postId: number | undefined;
  // The Page a post made before destinations existed names.
  legacyPageId: string | null;
  picked: Set<string>;
  onPicked: (next: Set<string>) => void;
  wording: Wording;
  onWording: (next: Wording) => void;
  message: string;
  productId: number | null;
  // The post has already gone out: choices are changed in the Post to… dialog.
  readOnly: boolean;
  wordingLocked: boolean;
}) => {
  const { data: channels = [], isPending: channelsLoading } = useChannels();
  const { forPost, loading } = useDestinations();
  const rows: DestinationRow[] = forPost(postId);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || loading || channelsLoading) return;
    seeded.current = true;
    const known = new Set(channels.map((c) => c.channel_key));
    const defaultPage = channels.find(
      (c) => c.platform === "facebook" && c.is_default,
    )?.channel_key;
    if (postId !== undefined && rows.length) {
      onPicked(
        new Set(
          rows.filter((r) => r.state !== "removed").map((r) => r.channel_key),
        ),
      );
      onWording(wordingFrom(rows));
    } else if (postId !== undefined) {
      // A draft made before destinations existed: the Page it named, or the default Page.
      const legacy = legacyPageId
        ? `facebook:page:${legacyPageId}`
        : defaultPage;
      onPicked(new Set(legacy && known.has(legacy) ? [legacy] : []));
    } else {
      const last = rememberedChoice().filter((k) => known.has(k));
      onPicked(new Set(last.length ? last : defaultPage ? [defaultPage] : []));
    }
    // Seed once, when what is saved has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, channelsLoading]);

  const toggle = (key: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(key);
    else next.delete(key);
    onPicked(next);
  };
  const facebook = channels.filter((c) => c.platform === "facebook");
  const linkedin = channels.filter((c) => c.platform === "linkedin");
  const anyLinkedIn =
    [...picked].some((k) => platformOf(k) === "linkedin") ||
    rows.some((r) => platformOf(r.channel_key) === "linkedin");

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Where it goes</h3>

      <Group
        title="Facebook"
        channels={facebook}
        rows={rows}
        picked={picked}
        onToggle={toggle}
        locked={readOnly}
        empty={
          <>
            No Facebook Page is connected.{" "}
            <Link to="/channels" className="underline">
              Connect one under Accounts
            </Link>
            .
          </>
        }
      />
      <Group
        title="LinkedIn"
        channels={linkedin}
        rows={rows}
        picked={picked}
        onToggle={toggle}
        locked={readOnly}
        empty={
          <>
            No LinkedIn account is connected.{" "}
            <Link to="/channels" className="underline">
              Connect one under Accounts
            </Link>
            .
          </>
        }
      />

      {anyLinkedIn ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            Words for LinkedIn
          </h4>
          <LinkedInWording
            value={wording}
            onChange={onWording}
            postMessage={message}
            productId={productId}
            locked={readOnly || wordingLocked}
            name={String(postId ?? "new")}
          />
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Facebook schedules its own posts (10 minutes to 30 days ahead). LinkedIn
        posts go out at the planned time, posted by ReplyFlow, or straight away
        with Post now. The same wording is approved with the post.
      </p>
    </section>
  );
};
