import { Facebook, Linkedin } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { health, type Channel, type Health } from "../posts/destinations";
import { useChannels } from "../posts/useDestinations";

const NOTE: Record<Health, string> = {
  ok: "Working",
  soon: "Ends soon: connect again",
  expired: "Expired: connect again",
};

const days = (expiresAt: string) =>
  Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000));

const Item = ({ channel }: { channel: Channel }) => {
  const h = health(channel.expires_at);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {channel.name || "Unnamed"}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {channel.kind === "profile" ? "your profile" : "Page"}
            {channel.is_default ? " · default" : ""}
          </span>
        </p>
        <p
          className={
            h === "ok"
              ? "text-xs text-muted-foreground"
              : "text-xs text-destructive"
          }
        >
          {NOTE[h]}
          {channel.expires_at && h !== "expired"
            ? ` · about ${days(channel.expires_at)} days left`
            : ""}
        </p>
      </div>
    </li>
  );
};

const Group = ({
  icon,
  title,
  uses,
  channels,
  manageTo,
  manageLabel,
}: {
  icon: React.ReactNode;
  title: string;
  uses: string;
  channels: Channel[];
  manageTo: string;
  manageLabel: string;
}) => (
  <Card className="gap-0 p-0">
    <CardContent className="flex flex-col gap-1 p-4">
      <h2 className="flex items-center gap-2 font-medium">
        {icon} {title}
      </h2>
      <p className="text-sm text-muted-foreground">{uses}</p>
    </CardContent>
    {channels.length ? (
      <ul className="divide-y border-t">
        {channels.map((c) => (
          <Item key={c.channel_key} channel={c} />
        ))}
      </ul>
    ) : (
      <p className="border-t px-4 py-3 text-sm text-muted-foreground">
        Nothing connected yet.
      </p>
    )}
    <div className="border-t p-3">
      <Button asChild size="sm" variant="outline">
        <Link to={manageTo}>{manageLabel}</Link>
      </Button>
    </div>
  </Card>
);

// Every account the business has connected, on both platforms, in one place: what it is, whether it is still
// working, and where to connect or renew it. The same list is what the post editor offers as destinations.
export const ChannelsPage = () => {
  const { data: channels = [], isPending } = useChannels();
  const facebook = channels.filter((c) => c.platform === "facebook");
  const linkedin = channels.filter((c) => c.platform === "linkedin");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Every Facebook and LinkedIn account connected to your business. These
          are the places a post can go and the Pages whose messages, comments
          and results you can see.
        </p>
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : (
        <>
          <Group
            icon={<Facebook className="size-4" />}
            title="Facebook"
            uses="Posting, scheduling, the Messenger inbox and comments."
            channels={facebook}
            manageTo="/facebook"
            manageLabel="Manage Facebook Pages"
          />
          <Group
            icon={<Linkedin className="size-4" />}
            title="LinkedIn"
            uses="Posting to your profile and company Pages, Page comments and results, and the ads report. A LinkedIn connection lasts about two months, then needs renewing."
            channels={linkedin}
            manageTo="/linkedin"
            manageLabel="Manage LinkedIn"
          />
        </>
      )}
    </div>
  );
};
