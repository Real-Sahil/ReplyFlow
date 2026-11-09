import { useEffect, useRef } from "react";
import { Facebook } from "lucide-react";
import { Link } from "react-router";

import { ChannelRow } from "./ChannelRow";
import { rememberedChoice } from "./destinationActions";
import { LinkedInWording } from "./LinkedInWording";
import { wordingFrom, type DestinationRow, type Wording } from "./destinations";
import { useChannels, useDestinations } from "./useDestinations";

// The "Where it goes" part of the post editor. Facebook is the post's main destination, posted from this editor
// to the Page chosen above. LinkedIn lists the person's own profile and every connected company Page, each as a
// tick box with where it stands, and one choice of wording for all of them. It starts from what the post already
// has saved, or, for a new post, from the channels last used.
export const DestinationsCard = ({
  postId,
  picked,
  onPicked,
  wording,
  onWording,
  message,
  productId,
  readOnly,
  wordingLocked,
  facebookName,
}: {
  postId: number | undefined;
  picked: Set<string>;
  onPicked: (next: Set<string>) => void;
  wording: Wording;
  onWording: (next: Wording) => void;
  message: string;
  productId: number | null;
  // The post has already gone out: choices are changed in the Post to… dialog.
  readOnly: boolean;
  wordingLocked: boolean;
  facebookName: string;
}) => {
  const { data: channels = [], isPending: channelsLoading } = useChannels();
  const { forPost, loading } = useDestinations();
  const rows: DestinationRow[] = forPost(postId);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || loading || channelsLoading) return;
    seeded.current = true;
    if (postId !== undefined) {
      onPicked(
        new Set(
          rows.filter((r) => r.state !== "removed").map((r) => r.channel_key),
        ),
      );
      onWording(wordingFrom(rows));
    } else {
      const known = new Set(channels.map((c) => c.channel_key));
      onPicked(new Set(rememberedChoice().filter((k) => known.has(k))));
    }
    // Seed once, when what is saved has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, channelsLoading]);

  const linkedin = channels.filter((c) => c.platform === "linkedin");
  const toggle = (key: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(key);
    else next.delete(key);
    onPicked(next);
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Where it goes</h3>

      <div className="flex items-start gap-2 text-sm">
        <Facebook
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p>
          <span className="font-medium">{facebookName}</span>
          <span className="block text-xs text-muted-foreground">
            Facebook is posted or scheduled from this editor, to the Page chosen
            above.
          </span>
        </p>
      </div>

      {linkedin.length ? (
        <ul className="divide-y rounded-lg border">
          {linkedin.map((channel) => (
            <ChannelRow
              key={channel.channel_key}
              channel={channel}
              row={rows.find((r) => r.channel_key === channel.channel_key)}
              checked={picked.has(channel.channel_key)}
              onCheck={(on) => toggle(channel.channel_key, on)}
              locked={readOnly}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No LinkedIn account is connected.{" "}
          <Link to="/channels" className="underline">
            Connect one under Accounts
          </Link>
          .
        </p>
      )}

      {picked.size > 0 || rows.length > 0 ? (
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
        LinkedIn posts go out at the planned time (ReplyFlow posts them) or
        straight away with Post now. The same wording is approved with the post.
      </p>
    </section>
  );
};
